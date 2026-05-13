import numpy as np

def predict_next_position(coords):
    if len(coords) < 2:
        return None

    (lat1, lon1) = coords[-2]
    (lat2, lon2) = coords[-1]

    # Simple velocity-based prediction
    dlat = lat2 - lat1
    dlon = lon2 - lon1

    next_lat = lat2 + dlat
    next_lon = lon2 + dlon

    return (next_lat, next_lon)
