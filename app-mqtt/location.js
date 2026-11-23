const options = { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 };

export function createLocationTracker(geolocation) {
  let watchId = null;
  let requestId = 0;

  function stop() {
    // 停止・再開後に古いコールバックが届いても画面に反映しない。
    requestId += 1;
    if (watchId !== null) {
      geolocation.clearWatch(watchId);
      watchId = null;
    }
  }

  function start(continuous, onReading, onError) {
    stop();
    const id = requestId;
    const success = ({ coords, timestamp }) => {
      if (id !== requestId) return;

      // ブラウザ固有のオブジェクトから、画面や後続の処理が使う値だけを取り出す。
      const { latitude, longitude, accuracy, altitude, altitudeAccuracy } = coords;
      onReading({ latitude, longitude, accuracy, altitude, altitudeAccuracy, timestamp });
    };
    const failure = (error) => {
      if (id === requestId) onError(error);
    };

    try {
      if (continuous) {
        watchId = geolocation.watchPosition(success, failure, options);
      } else {
        geolocation.getCurrentPosition(success, failure, options);
      }
    } catch (error) {
      failure(error);
    }
  }

  return { start, stop };
}
