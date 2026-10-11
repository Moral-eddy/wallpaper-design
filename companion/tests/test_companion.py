from pathlib import Path
import json
import logging
import subprocess
import sys
import socket
import time
import tempfile
import threading
import urllib.request
import urllib.error
import unittest

HERE = Path(__file__).resolve().parent
SOURCE = HERE.parent
sys.path.insert(0, str(SOURCE))
from companion_core import Runtime, bind_wallpaper, discover_wallpapers, load_key, validate_wallpaper, SingleInstance, wallpaper_data_root

class CoreChecks(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp(prefix='core-check-', dir=None))
        self.wallpaper = self.root / '壁纸 with spaces'
        self.wallpaper.mkdir()
        (self.wallpaper / 'index.html').write_text('<html></html>', encoding='utf-8')
        (self.wallpaper / 'project.json').write_text(json.dumps({'type':'web','file':'index.html'}), encoding='utf-8')

    def test_key_stability_and_corruption(self):
        first = load_key(self.root)
        self.assertEqual(first, load_key(self.root))
        path = self.root / 'read-access.json'
        path.write_text('{"key":"bad"}', encoding='utf-8')
        with self.assertRaises(ValueError): load_key(self.root)
        self.assertEqual(path.read_text(), '{"key":"bad"}')

    def test_downloaded_workshop_format_and_type_case(self):
        downloaded = {'type':'Web','file':'index.html','title':'Workshop test fixture'}
        self.assertEqual(downloaded['type'], 'Web')
        (self.wallpaper / 'project.json').write_text(json.dumps(downloaded), encoding='utf-8')
        self.assertEqual(validate_wallpaper(self.wallpaper), self.wallpaper.resolve())
        for kind in ['web', 'Web', 'WEB', 'wEb']:
            with self.subTest(kind=kind):
                (self.wallpaper / 'project.json').write_text(json.dumps({'type':kind,'file':'index.html'}))
                self.assertEqual(validate_wallpaper(self.wallpaper), self.wallpaper.resolve())
        for kind in [None, 1, {}, 'scene']:
            with self.subTest(invalidKind=kind):
                (self.wallpaper / 'project.json').write_text(json.dumps({'type':kind,'file':'index.html'}))
                with self.assertRaises(ValueError): validate_wallpaper(self.wallpaper)

    def test_binding_preserves_project_and_backs_up_old_config(self):
        original = (self.wallpaper / 'project.json').read_bytes()
        destination = self.wallpaper / 'telemetry-config.local.js'
        destination.write_text('old private config', encoding='utf-8')
        key = load_key(self.root)
        bind_wallpaper(self.root, self.wallpaper, key, 64590)
        value = json.loads(destination.read_text().split('=',1)[1].strip().rstrip(';'))
        self.assertEqual(value, {'base':'http://127.0.0.1:64590','key':key})
        self.assertEqual((self.wallpaper / 'project.json').read_bytes(), original)
        self.assertEqual(next((self.root / 'backups').glob('*.js')).read_text(), 'old private config')

    def test_entry_escape_and_non_web_rejected(self):
        (self.wallpaper / 'project.json').write_text('{"type":"web","file":"../outside.html"}')
        with self.assertRaises(ValueError): validate_wallpaper(self.wallpaper)
        (self.wallpaper / 'project.json').write_text('{"type":"scene","file":"index.html"}')
        with self.assertRaises(ValueError): validate_wallpaper(self.wallpaper)

    def test_steam_multiple_libraries(self):
        steam = self.root / 'Steam'
        secondary = self.root / 'Other library'
        (steam / 'steamapps').mkdir(parents=True)
        (steam / 'steamapps/libraryfolders.vdf').write_text('"path" "'+str(secondary).replace('\\','\\\\')+'"')
        target = secondary / 'steamapps/workshop/content/431960/3817553402'
        target.mkdir(parents=True)
        (target / 'project.json').write_text('{"type":"web","file":"index.html"}')
        (target / 'index.html').write_text('<html></html>')
        self.assertEqual(discover_wallpapers([steam]), [target.resolve()])

    def test_instance_mutex(self):
        first = SingleInstance(self.root)
        second = SingleInstance(self.root)
        try:
            self.assertFalse(first.already_running)
            self.assertTrue(second.already_running)
        finally:
            second.close()
            first.close()

    def test_isolated_http_real_hardware_and_keys(self):
        app = Runtime(self.root, SOURCE / 'configure.html', 0)
        try:
            app.bind(self.wallpaper)
            base = f'http://127.0.0.1:{app.port}'
            self.assertEqual(urllib.request.urlopen(base+'/configure.html').status, 200)
            request = urllib.request.Request(base+'/api/v1/snapshot', headers={'Origin':'null','X-Wallpaper-Read-Key':app.key})
            value = json.load(urllib.request.urlopen(request))
            self.assertEqual(value['schemaVersion'], 1)
            self.assertEqual(urllib.request.urlopen(request).headers['Access-Control-Allow-Origin'], 'null')
            bad = urllib.request.Request(base+'/api/v1/snapshot', headers={'Origin':'null','X-Wallpaper-Read-Key':'bad'})
            with self.assertRaises(urllib.error.HTTPError) as rejected: urllib.request.urlopen(bad)
            self.assertEqual(rejected.exception.code, 403)
            foreign = urllib.request.Request(base+'/api/v1/snapshot', headers={'Origin':'https://example.com','X-Wallpaper-Read-Key':app.key})
            with self.assertRaises(urllib.error.HTTPError) as rejected: urllib.request.urlopen(foreign)
            self.assertEqual(rejected.exception.code, 403)
            preflight = urllib.request.Request(base+'/api/v1/snapshot', method='OPTIONS', headers={'Origin':'null','Access-Control-Request-Method':'GET','Access-Control-Request-Headers':'X-Wallpaper-Read-Key'})
            self.assertEqual(urllib.request.urlopen(preflight).status, 204)
            invalid_post = urllib.request.Request(base+'/api/v1/config', data=b'{"unsupported":true}', headers={'Content-Type':'application/json'})
            with self.assertRaises(urllib.error.HTTPError) as rejected: urllib.request.urlopen(invalid_post)
            self.assertEqual(rejected.exception.code, 400)
        finally:
            app.close()

    def test_port_collision_preserves_existing_listener(self):
        owner = socket.socket()
        owner.bind(('127.0.0.1', 0))
        owner.listen()
        occupied = owner.getsockname()[1]
        app = Runtime(self.root, SOURCE / 'configure.html')
        app.preferred_ports = lambda: [occupied, 0]
        try:
            app.start()
            self.assertNotEqual(app.port, occupied)
            self.assertEqual(owner.getsockname()[1], occupied)
        finally:
            app.close()
            owner.close()

    def test_independent_temperature_paths_and_restart(self):
        export = self.root / 'separate export.json'
        export.write_text(json.dumps({'schemaVersion':1,'timestampMs':time.time()*1000,'status':'online',
                                     'sensors':[{'key':'0x01','valueC':65}], 'fans':[]}), encoding='utf-8')
        csv = self.root / 'other CSV/HWiNFO.csv'
        csv.parent.mkdir()
        csv.write_text('Date,CPU Package [°C]\n2026-10-11,55\n', encoding='utf-8-sig')
        app = Runtime(self.root, SOURCE / 'configure.html', 0)
        try:
            self.assertEqual(len(app.sensor_export(export)['sensors']), 1)
            app.sensor_log(csv)
            self.assertEqual(app.collector.alienware.path, export.resolve())
            app.sensor_export(export)
            deadline = time.monotonic() + 3
            while not app.collector.read().get('alienware', {}).get('sensors'):
                if time.monotonic() >= deadline: raise AssertionError('Sensor fixture not read')
                time.sleep(.05)
            app.collector.configure({'awccTemperatureSensor':'0x01'})
            settings = json.loads((self.root / 'user-settings.json').read_text())
            self.assertEqual(settings['alienwareExportPath'], str(export.resolve()))
            self.assertEqual(settings['sensorLogPath'], str(csv.resolve()))
        finally:
            app.close()
        restarted = Runtime(self.root, SOURCE / 'configure.html', 0)
        try:
            restarted.start()
            self.assertEqual(restarted.collector.alienware.path, export.resolve())
            self.assertEqual(restarted.collector.sensor.path, csv.resolve())
            self.assertEqual(restarted.collector.awcc_temperature_sensor, '0x01')
        finally:
            restarted.close()

    def test_invalid_export_rejected_before_start(self):
        export = self.root / 'invalid.json'
        app = Runtime(self.root, SOURCE / 'configure.html', 0)
        try:
            for data in [[], {'schemaVersion':1,'timestampMs':float('nan')},
                         {'schemaVersion':1,'timestampMs':True}, {'schemaVersion':2,'timestampMs':0}]:
                export.write_text(json.dumps(data))
                with self.assertRaises(ValueError): app.sensor_export(export)
                self.assertIsNone(app.server)
        finally:
            app.close()

    def test_runtime_directory_is_under_selected_wallpaper(self):
        self.assertEqual(wallpaper_data_root(self.wallpaper), self.wallpaper.resolve() / 'telemetry-runtime')

    def test_registered_running_export_reused_without_elevation(self):
        export = self.root / 'existing.json'
        export.write_text(json.dumps({'schemaVersion':1,'timestampMs':time.time()*1000,'status':'online',
                                    'sensors':[{'key':'0x01','valueC':65}], 'fans':[]}))
        registration = self.root / 'installation.json'
        registration.write_text(json.dumps({'output':str(export)}))
        def forbidden(*args):
            raise AssertionError('Fresh existing export must not request elevation')
        app = Runtime(self.root, SOURCE / 'configure.html', 0)
        try:
            result = app.start_alienware(manager_factory=forbidden, installation_path=registration)
            self.assertEqual(result['mode'],'existing')
            self.assertEqual(app.collector.alienware.path, export)
            self.assertIsNone(app.managed_exporter)
        finally:
            app.close()

    def test_new_user_managed_export_and_cancel_semantics(self):
        class FakeProcess:
            def poll(self): return None
        class FakeManager:
            def __init__(self, root, resource):
                self.root=Path(root); self.process=None; self.stopped=False
            def start(self):
                path=self.root / 'managed-fixture.json'
                path.write_text(json.dumps({'schemaVersion':1,'timestampMs':time.time()*1000,'status':'online',
                                            'sensors':[{'key':'0x01','valueC':65}],'fans':[]}))
                self.process=FakeProcess()
                return path
            def poll(self): return None
            def stop(self): self.stopped=True; self.process=None
        app = Runtime(self.root, SOURCE / 'configure.html', 0)
        manager = None
        try:
            result=app.start_alienware(manager_factory=FakeManager,installation_path=self.root / 'no-registration.json')
            manager=app.managed_exporter
            self.assertEqual(result['mode'],'managed')
            self.assertEqual(app.collector.temperature_source,'alienware_wmi')
            self.assertEqual(len(app.alienware_state()['sensors']),1)
        finally:
            app.close()
        self.assertTrue(manager.stopped)
        cancelled_root=self.root / 'cancelled'
        cancelled = Runtime(cancelled_root, SOURCE / 'configure.html', 0)
        class CancelledManager:
            def __init__(self,*args): pass
            def start(self): raise PermissionError('User cancelled UAC')
        try:
            with self.assertRaises(PermissionError):
                cancelled.start_alienware(manager_factory=CancelledManager,installation_path=self.root / 'no-registration.json')
            self.assertEqual(cancelled.collector.temperature_source,'hwinfo_csv')
            self.assertIsNone(cancelled.managed_exporter)
        finally:
            cancelled.close()

    def test_managed_worker_arguments_integrity_and_stop_signal(self):
        from managed_sensors import ManagedExporter, SHELLEXECUTEINFO
        import ctypes
        self.assertEqual(ctypes.sizeof(SHELLEXECUTEINFO),112)
        class FakeElevated:
            def __init__(self, executable, arguments, directory):
                self.arguments=arguments; self.directory=Path(directory); self.running=True
            def poll(self): return None if self.running else 0
            def close(self):
                assert (self.directory / 'stop.signal').is_file()
                self.running=False
        manager = ManagedExporter(self.root, SOURCE / 'managed-awcc.ps1', launcher=FakeElevated)
        path=manager.start()
        process=manager.process
        self.assertTrue(path.is_relative_to(self.root))
        self.assertEqual(process.arguments[process.arguments.index('-File')+1],str(SOURCE / 'managed-awcc.ps1'))
        self.assertIn('-WindowStyle',process.arguments)
        self.assertTrue(manager.heartbeat_path.is_file())
        manager.stop()
        self.assertFalse(process.running)
        modified=self.root / 'changed-worker.ps1'
        modified.write_text('untrusted script')
        untrusted=ManagedExporter(self.root,modified,launcher=FakeElevated)
        with self.assertRaises(ValueError): untrusted.start()

