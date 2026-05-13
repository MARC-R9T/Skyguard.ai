import numpy as np

def haversine(lat1, lon1, lat2, lon2):
    R = 6371  # km

    lat1, lon1, lat2, lon2 = map(np.radians,
        [lat1, lon1, lat2, lon2])

    dlat = lat2 - lat1
    dlon = lon2 - lon1

    a = np.sin(dlat/2)**2 + np.cos(lat1)*np.cos(lat2)*np.sin(dlon/2)**2
    c = 2 * np.arcsin(np.sqrt(a))

    return R * c


def detect_future_conflicts(trajectory_dict, predict_fn, threshold_km=10):
    future_conflicts = []

    aircraft_ids = list(trajectory_dict.keys())

    # 🔮 Generate predictions for all aircraft
    predictions = {}

    for aid in aircraft_ids:
        coords = trajectory_dict[aid]

        if len(coords) >= 5:
            preds = predict_fn(coords, steps=5)
            if preds:
                predictions[aid] = preds

    # 🔥 Compare predicted paths
    for i in range(len(aircraft_ids)):
        for j in range(i + 1, len(aircraft_ids)):

            a1 = aircraft_ids[i]
            a2 = aircraft_ids[j]

            if a1 not in predictions or a2 not in predictions:
                continue

            path1 = predictions[a1]
            path2 = predictions[a2]

            # Compare step-by-step future positions
            for p1, p2 in zip(path1, path2):
                d = haversine(p1[0], p1[1], p2[0], p2[1])

                if d < threshold_km:
                    future_conflicts.append((a1, a2, d))
                    break

    return future_conflicts
