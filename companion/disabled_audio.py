class AudioProvider:
    """Hardware companion: Wallpaper Engine itself provides wallpaper audio."""
    def start(self):
        pass

    def close(self):
        pass

    def read(self):
        return {'schemaVersion':1,'status':'disabled',
                'message':'Music response uses Wallpaper Engine native audio; this app collects hardware only.'}
