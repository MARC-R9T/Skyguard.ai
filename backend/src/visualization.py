import plotly.graph_objects as go
from src.predict import predict_next_points

def plot_flights_with_trails(df, trajectory_dict):
    fig = go.Figure()

    # ✈️ Current positions
    fig.add_trace(go.Scattergeo(
        lon=df["lon"],
        lat=df["lat"],
        text=df["callsign"],
        mode='markers',
        marker=dict(size=6, color="red"),
        name="Flights"
    ))
  

    # ✈️ TRAILS + 🔮 PREDICTIONS
    for flight, coords in trajectory_dict.items():
            

        if len(coords) > 1:
            lats = [c[0] for c in coords]
            lons = [c[1] for c in coords]

            # 🧵 ACTUAL TRAIL
            fig.add_trace(go.Scattergeo(
                lon=lons,
                lat=lats,
                mode='lines',
                line=dict(width=1, color="gray"),
                showlegend=False
            ))

        # 🔮 LSTM PREDICTION (IMPORTANT)
        if len(coords) >= 5:
            preds = predict_next_points(coords, steps=5)

            if preds:
                pred_lats = [p[0] for p in preds]
                pred_lons = [p[1] for p in preds]

                # connect last real point to prediction
                pred_lats = [coords[-1][0]] + pred_lats
                pred_lons = [coords[-1][1]] + pred_lons

                fig.add_trace(go.Scattergeo(
                    lon=pred_lons,
                    lat=pred_lats,
                    mode='lines+markers',
                    line=dict(color="green", width=2, dash="dash"),
                    marker=dict(size=5, color="green"),
                    name=f"{flight}_pred"
                ))

    fig.update_layout(
        title="Live Flight Trajectories",
        geo=dict(
            scope="asia",
            projection_type="natural earth"
        )
    )

    return fig


def plot_with_conflicts(df, trajectory_dict, conflicts, future_conflicts):
    fig = go.Figure()

    # ✈️ CURRENT FLIGHTS
    fig.add_trace(go.Scattergeo(
        lon=df["lon"],
        lat=df["lat"],
        text=df.get("callsign", ""),
        mode='markers',
        marker=dict(size=6, color="blue"),
        name="Flights"
    ))

    # 🧵 TRAILS + 🔮 PREDICTIONS
    for flight, coords in trajectory_dict.items():

        if len(coords) > 1:
            lats = [c[0] for c in coords]
            lons = [c[1] for c in coords]

            # TRAIL
            fig.add_trace(go.Scattergeo(
                lon=lons,
                lat=lats,
                mode='lines',
                line=dict(width=1, color="gray"),
                showlegend=False
            ))

        # 🔮 LSTM PREDICTION
        if len(coords) >= 5:
            preds = predict_next_points(coords, steps=5)

            if preds:
                pred_lats = [coords[-1][0]] + [p[0] for p in preds]
                pred_lons = [coords[-1][1]] + [p[1] for p in preds]

                fig.add_trace(go.Scattergeo(
                    lon=pred_lons,
                    lat=pred_lats,
                    mode='lines+markers',
                    line=dict(color="green", width=2, dash="dash"),
                    marker=dict(size=5, color="green"),
                    name=f"{flight}_pred"
                ))

    # ⚠️ CONFLICTS
    for f1, f2, dist in conflicts:
        fig.add_trace(go.Scattergeo(
            lon=[f1["lon"], f2["lon"]],
            lat=[f1["lat"], f2["lat"]],
            mode='lines+markers',
            line=dict(color="red", width=3),
            marker=dict(size=8, color="red"),
            showlegend=False
        ))




         # 🟡 FUTURE Conflicts (✨ ADD HERE ✨)
    for f1, f2, dist in future_conflicts:
        if f1 in trajectory_dict and f2 in trajectory_dict:

            p1 = trajectory_dict[f1][-1]
            p2 = trajectory_dict[f2][-1]

            fig.add_trace(go.Scattergeo(
                lon=[p1[1], p2[1]],
                lat=[p1[0], p2[0]],
                mode='lines',
                line=dict(color="yellow", width=2, dash="dot"),
                showlegend=False
            ))


        

    fig.update_layout(
        title="✈️ Air Traffic with Prediction & Conflict Detection",
        geo=dict(scope="asia")
    )

    return fig
