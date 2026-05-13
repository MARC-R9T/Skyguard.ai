# Skyguard AI: End-to-End Technical Process Flow

This document outlines the complete technical execution flow for the **Skyguard AI: Integrated Aviation Analytics** platform. It covers the journey of data from raw ingestion to final user visualization.

## 1. High-Level Architecture Diagram

```mermaid
graph TD
    %% 1. Data Ingestion
    subgraph Data_Ingestion ["1. Data Ingestion Layer"]
        OS[OpenSky REST API<br/>JSON States]
        AD[ADS-B Stream<br/>Raw 1090MHz]
        WX[Weather Service<br/>GRIB/JSON]
        REG[Aviation Registry<br/>Static Data]
    end

    %% 2. Preprocessing
    subgraph Preprocessing ["2. Data Preprocessing & Fusion"]
        DF[Data Fetcher & Streamer]
        CLN[Noise Filtering & Interpolation]
        FUSE[Multi-modal State Fusion]
    end

    %% 3. AI Analytics Engine
    subgraph AI_Engine ["3. AI Analytics Engine"]
        TRJ[LSTM Trajectory Predictor]
        DEL[XGBoost Cascade Delay Modeler]
        CFD[Proximity & Conflict Detector]
        FUT[Future Path Extrapolation]
    end

    %% 4. Application Layer
    subgraph App_Layer ["4. Application & State Layer"]
        SM[(Central State Manager<br/>In-Memory Bridge)]
        API[FastAPI REST Service]
    end

    %% 5. Frontend Interfaces
    subgraph Frontend ["5. User Interfaces"]
        GLB[React 3D Globe<br/>Three.js / WebGL]
        ST[Streamlit Dashboard<br/>Metrics & Charts]
    end

    %% Flow Connections
    OS --> DF
    AD --> DF
    DF --> CLN
    WX --> FUSE
    REG --> FUSE
    CLN --> FUSE

    FUSE --> TRJ
    FUSE --> DEL
    FUSE --> CFD
    
    TRJ --> FUT
    FUT -.-> CFD

    FUSE --> SM
    TRJ --> SM
    DEL --> SM
    CFD --> SM

    SM <--> API
    SM -.-> ST

    API --> GLB
    API --> ST
```

---

## 2. Detailed Technical Process Breakdown

### Phase 1: Data Ingestion (The Source)
The system operates asynchronously to gather disparate data streams in real-time.
*   **`data_fetcher.py` / `adsb_streamer.py`**: A continuous polling mechanism interfaces with the OpenSky Network API to gather global flight state vectors (Latitude, Longitude, Altitude, Velocity, Heading, ICAO24).
*   **`weather_service.py`**: Fetches real-time localized weather data (wind gradients, temperature) required for accurate delay and trajectory modeling.
*   **Static Assets**: Pulls from local registry files to append fixed flight metadata (aircraft type, wake turbulence category).

### Phase 2: Preprocessing & Fusion (The Pipeline)
Raw data cannot be fed directly into ML models. It must be cleaned and synchronized.
*   **`data_preprocessing.py`**: Executes noise filtering to drop corrupted packets and imputes missing coordinates via linear interpolation. 
*   **`geo_context.py`**: Applies spatial filters (e.g., bounding boxes for specific global regions) and maps states against terrestrial terrain definitions.
*   **`merge_data.py`**: Aligns timestamped flight vectors with asynchronous weather grids and static registry data to create a unified `FlightState` object.

### Phase 3: AI Analytics Engine (The Brain)
The cleaned, unified data branches into concurrent predictive models.
*   **Trajectory Prediction (`predict.py`, `train_lstm.py`)**: Uses a trained LSTM (Long Short-Term Memory) neural network to predict the next `N` spatial coordinates of a flight based on historical velocity and heading. (Falls back to `forecasting.py` heuristic math if ML confidence is low).
*   **Cascade Delay Modeling (`analysis.py`, `delays.py`)**: Utilizes XGBoost and an LSTM Meta-model. It computes localized base delays using weather/traffic density, and simulates network-wide "spillover" delays affecting consecutive flights.
*   **Conflict Detection (`conflict_detector.py`, `future_conflict_detector.py`)**: Computes 3D Haversine distances. Checks current states for immediate proximity threshold breaches and analyzes extrapolated future trajectories for anticipated collisions.

### Phase 4: Application Layer (The Bridge)
This acts as the intermediary broker between the heavy backend computations and lightweight frontend clients.
*   **`bridge.py` / `main_loop.py`**: A continuous background daemon that loops over the AI Analytics outputs and updates a centralized dictionary/state object in memory. 
*   **`app.py`**: A FastAPI web server that mounts REST endpoints (`/flights`, `/predict`, `/conflicts`, `/dashboard`) to serve the latest state dictionary as serialized JSON payloads upon request.

### Phase 5: User Interfaces (The Presentation)
*   **React 3D Globe (`Globe.tsx`)**: The Vite + React frontend continually polls the FastAPI `/flights` endpoint. It leverages Three.js and D3.js to map the 2D geospatial coordinates onto an interactive 3D WebGL sphere, drawing interpolated arcs for trajectories.
*   **Streamlit Analytics (`streamlit_app.py`)**: Connects directly to the backend state bridge. It renders complex dataframes, Plotly time-series charts, and aggregated KPI metrics (like system-wide delay averages and active conflicts) for detailed analytical reviews.

---

## 3. Delay Simulation Process Flow

The system takes historical or demo aviation data, selects a specific aircraft's daily flight sequence, and runs it through a series of machine learning models to simulate how delays propagate throughout the day.

```mermaid
graph TD
    %% Styling to mimic the dark theme diagram
    classDef initBox fill:#333,stroke:#666,stroke-width:2px,color:#fff;
    classDef process fill:#222,stroke:#555,stroke-width:1px,color:#fff;
    classDef decision fill:#222,stroke:#555,stroke-width:1px,color:#fff;

    subgraph System_Initialization ["1. System Initialization"]
        style System_Initialization fill:#444,stroke:#666,color:#fff,stroke-width:2px
        
        LD[Load Data & Encoders]:::process
        XG[Load XGBoost Base Model]:::process
        LS[Load LSTM Propagation Model]:::process
        MM[Load Meta-Model]:::process
        
        DS{Dataset Selection}:::decision
        SE[Initialize Simulation Engine]:::process
        
        LD --> DS
        XG --> SE
        LS --> SE
        MM --> SE
    end
    
    DS -- "Demo CSV / Full Parquet" --> SAT[Select Aircraft Tail]:::process
    SAT --> SSD[Select Specific Date]:::process
    SSD --> FDC[Filter: Daily Flight Chain]:::process
    FDC --> OW{Override Weather?}:::decision
    
    OW -- Yes --> CW["Input Custom Wind, Precip, ..."]:::process
    OW -- No --> NW[Use Original Weather Data]:::process
    
    CW --> RUN[Simulation Pipeline Execution]:::process
    NW --> RUN
    SE -.-> RUN
```
