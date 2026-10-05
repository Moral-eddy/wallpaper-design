"""In-memory analysis of the default Windows playback endpoint; production only."""
from __future__ import annotations
from datetime import datetime
from pathlib import Path
import json
import math
import sys
import threading
import time
import uuid

SAMPLE_RATE = 48000
FFT_SIZE = 4096
READ_FRAMES = 1024
SPECTRUM_BINS = 48
FLOOR_DB_FS = -60.0
STALE_SECONDS = 2.0
SOURCE = 'Windows WASAPI loopback'
ENERGY_FIELDS = ('leftRelativeEnergy', 'rightRelativeEnergy', 'lowRelativeEnergy',
                 'midRelativeEnergy', 'highRelativeEnergy')


def iso_now():
    return datetime.now().astimezone().isoformat(timespec='milliseconds')


class AudioAnalysis:
    def __init__(self, numpy):
        self.np = numpy
        self.samples = numpy.empty((0, 2), dtype='float64')
        self.window = numpy.hanning(FFT_SIZE)
        self.denominator = FFT_SIZE * float(numpy.sum(self.window ** 2))
        frequency = numpy.fft.rfftfreq(FFT_SIZE, 1.0 / SAMPLE_RATE)
        resolution = SAMPLE_RATE / FFT_SIZE
        bin_low = numpy.maximum(0.0, frequency - resolution / 2)
        bin_high = frequency + resolution / 2
        edges = numpy.geomspace(30, 16000, SPECTRUM_BINS + 1)

        def weights(low, high):
            # Split measured FFT-bin power by overlap with each frequency range.
            return numpy.maximum(0.0, numpy.minimum(bin_high, high) -
                                 numpy.maximum(bin_low, low)) / resolution

        self.spectrum_weights = numpy.stack([weights(a, b) for a, b in zip(edges[:-1], edges[1:])])
        self.band_weights = numpy.stack([weights(20, 250), weights(250, 2000), weights(2000, 16000)])

    def display_response(self, amplitude):
        np = self.np
        decibels = 20.0 * np.log10(np.maximum(amplitude, 1e-12))
        return np.clip((decibels - FLOOR_DB_FS) / -FLOOR_DB_FS, 0, 1)

    def accept(self, incoming):
        np = self.np
        data = np.asarray(incoming, dtype='float64')
        if data.ndim != 2 or data.shape[1] != 2 or not np.isfinite(data).all():
            raise RuntimeError('默认播放设备没有返回有效的双声道音频帧')
        if not len(data): return None
        self.samples = np.concatenate((self.samples, data), axis=0)[-FFT_SIZE:]
        if len(self.samples) < FFT_SIZE: return None
        centered = self.samples - np.mean(self.samples, axis=0)
        rms = np.sqrt(np.mean(centered ** 2, axis=0))
        transform = np.fft.rfft(centered * self.window[:, None], axis=0)
        power = np.abs(transform) ** 2 / self.denominator
        power[1:-1] *= 2
        spectrum = self.display_response(np.sqrt(self.spectrum_weights @ power))
        bands = self.display_response(np.sqrt(self.band_weights @ np.mean(power, axis=1)))
        stereo = self.display_response(rms)
        silent = bool(np.max(rms) < 10 ** (FLOOR_DB_FS / 20))
        return {
            'status': 'silent' if silent else 'online',
            'leftRelativeEnergy': round(float(stereo[0]), 4),
            'rightRelativeEnergy': round(float(stereo[1]), 4),
            'lowRelativeEnergy': round(float(bands[0]), 4),
            'midRelativeEnergy': round(float(bands[1]), 4),
            'highRelativeEnergy': round(float(bands[2]), 4),
            'spectrumLeft': [round(float(value), 4) for value in spectrum[:, 0]],
            'spectrumRight': [round(float(value), 4) for value in spectrum[:, 1]],
            'leftRmsDbFS': round(20 * math.log10(float(rms[0])), 2) if rms[0] > 0 else None,
            'rightRmsDbFS': round(20 * math.log10(float(rms[1])), 2) if rms[1] > 0 else None,
            'message': '系统播放回环已连接；当前低于显示底噪' if silent else '系统播放声音已接入',
        }


class AudioProvider:
    def __init__(self):
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.thread = None
        self.frame = self.empty_state('warming', '等待默认播放设备')
        self.tick = None
        self.sequence = 0
        self.session = None

    @staticmethod
    def empty_state(status, message, device=None):
        return {
            'schemaVersion': 1, 'status': status, 'source': SOURCE,
            'scope': 'default_playback_device', 'message': message,
            'device': device, 'timestamp': iso_now(), 'timestampMs': int(time.time() * 1000),
            'sampleRateHz': SAMPLE_RATE, 'fftSize': FFT_SIZE, 'spectrumBins': SPECTRUM_BINS,
            'spectrumRangeHz': [30, 16000], 'bandRangesHz': [[20, 250], [250, 2000], [2000, 16000]],
            'displayScaleDbFS': [FLOOR_DB_FS, 0], 'staleAfterMs': int(STALE_SECONDS * 1000),
            'spectrumLeft': [], 'spectrumRight': [], **{name: None for name in ENERGY_FIELDS},
        }

    def publish(self, state):
        with self.lock:
            self.sequence += 1
            state['frameSequence'] = self.sequence
            state['sessionId'] = self.session
            self.frame = state
            self.tick = time.monotonic()

    def start(self):
        self.thread = threading.Thread(target=self.run, name='default-playback-audio', daemon=True)
        self.thread.start()

    def close(self):
        self.stop.set()
        if self.thread: self.thread.join(timeout=2)

    def read(self):
        with self.lock:
            state = json.loads(json.dumps(self.frame, allow_nan=False))
            if state['status'] in {'online', 'silent'} and (self.tick is None or time.monotonic() - self.tick > STALE_SECONDS):
                stale = self.empty_state('stale', '音频帧已停止更新，等待播放设备恢复', state.get('device'))
                stale.update(timestamp=state['timestamp'], timestampMs=state['timestampMs'],
                             frameSequence=state.get('frameSequence'), sessionId=self.session)
                return stale
            return state

    def run(self):
        # Import SoundCard on this worker thread so its Windows COM apartment
        # and all playback device handles live on their owning thread.
        device = None
        try:
            import numpy as np
            import soundcard as sc
        except Exception as exc:
            self.publish(self.empty_state('offline', '音频依赖暂不可用：' + str(exc)))
            return
        while not self.stop.is_set():
            try:
                speaker = sc.default_speaker()
                if speaker is None: raise RuntimeError('Windows 没有默认播放设备')
                device = {'id': speaker.id, 'name': speaker.name}
                loopback = sc.get_microphone(speaker.id, include_loopback=True)
                if not loopback.isloopback: raise RuntimeError('默认播放设备的回环接口不可用')
                self.session = str(uuid.uuid4())
                self.publish(self.empty_state('warming', '正在连接系统默认播放设备', device))
                analysis = AudioAnalysis(np)
                next_device_read = time.monotonic() + 1.0
                # Shared mode follows Windows' output mix. Request stereo to
                # avoid SoundCard's documented single-channel WASAPI limitation.
                with loopback.recorder(samplerate=SAMPLE_RATE, channels=2,
                                       blocksize=2048, exclusive_mode=False) as recorder:
                    while not self.stop.is_set():
                        incoming = recorder.record(numframes=READ_FRAMES)
                        measured = analysis.accept(incoming)
                        if measured is not None:
                            frame = self.empty_state(measured['status'], measured['message'], device)
                            frame.update(measured)
                            self.publish(frame)
                        if time.monotonic() >= next_device_read:
                            current = sc.default_speaker()
                            if current is None or current.id != speaker.id:
                                self.publish(self.empty_state('warming', '默认播放设备已切换，正在重新连接'))
                                break
                            next_device_read = time.monotonic() + 1.0
            except Exception as exc:
                self.publish(self.empty_state('offline', '系统播放回环暂不可用：' + str(exc), device))
                self.stop.wait(3)
