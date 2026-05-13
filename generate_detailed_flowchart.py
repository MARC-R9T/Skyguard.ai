import matplotlib.pyplot as plt
import matplotlib.patches as patches
import sys
import os

try:
    fig, ax = plt.subplots(figsize=(20, 14), dpi=300)
    ax.axis('off')

    # Utility function to draw a box and return its anchor points
    # Returns dictionary of connection points
    def draw_box(ax, x, y, width, height, text, color='#f0f4f8', edgecolor='#2c3e50', text_size=10, style='solid'):
        rect = patches.Rectangle((x, y), width, height, linewidth=2.0, edgecolor=edgecolor, facecolor=color, linestyle=style)
        ax.add_patch(rect)
        ax.text(x + width/2, y + height/2, text, horizontalalignment='center', verticalalignment='center', 
                fontsize=text_size, family='sans-serif', fontweight='bold', wrap=True)
        return {
            'left': (x, y + height/2),
            'right': (x + width, y + height/2),
            'top': (x + width/2, y + height),
            'bottom': (x + width/2, y),
            'mid': (x + width/2, y + height/2)
        }

    def draw_arrow(ax, p1, p2, connectionstyle="arc3", color='#34495e', lw=1.5, linestyle='solid', label=None):
        ax.annotate('', xy=p2, xytext=p1, 
                    arrowprops=dict(arrowstyle="->", color=color, lw=lw, ls=linestyle, connectionstyle=connectionstyle))
        if label:
            mx = (p1[0] + p2[0]) / 2
            my = (p1[1] + p2[1]) / 2
            ax.text(mx, my + 0.2, label, fontsize=8, family='sans-serif', color='#2c3e50',
                    ha='center', va='center', bbox=dict(facecolor='white', edgecolor='none', alpha=0.8, pad=1))

    # --- Layout Definitions ---
    col1 = 1.0   # Data Sources
    col2 = 5.5   # Preprocessing
    col3 = 10.0  # Core AI
    col4 = 14.5  # Backend
    col5 = 19.0  # Frontend
    
    bw = 3.5  # Box width
    bh = 1.2  # Box height

    # Group Bounding Boxes
    ax.add_patch(patches.Rectangle((col1-0.3, 3.5), bw+0.6, 10.0, fill=True, facecolor='#f8f9fa', edgecolor='none', alpha=0.5))
    ax.text(col1 + bw/2, 13.8, "DATA INGESTION", ha='center', fontweight='bold', color='#7f8c8d')

    ax.add_patch(patches.Rectangle((col2-0.3, 3.5), bw+0.6, 10.0, fill=True, facecolor='#eef2f5', edgecolor='none', alpha=0.5))
    ax.text(col2 + bw/2, 13.8, "PREPROCESSING", ha='center', fontweight='bold', color='#7f8c8d')

    ax.add_patch(patches.Rectangle((col3-0.3, 3.5), bw+0.6, 10.0, fill=True, facecolor='#e8f6f3', edgecolor='none', alpha=0.5))
    ax.text(col3 + bw/2, 13.8, "AI ANALYTICS ENGINE", ha='center', fontweight='bold', color='#16a085')

    ax.add_patch(patches.Rectangle((col4-0.3, 3.5), bw+0.6, 10.0, fill=True, facecolor='#fef9e7', edgecolor='none', alpha=0.5))
    ax.text(col4 + bw/2, 13.8, "APPLICATION LAYER", ha='center', fontweight='bold', color='#d4ac0d')

    ax.add_patch(patches.Rectangle((col5-0.3, 3.5), bw+0.6, 10.0, fill=True, facecolor='#fdf2e9', edgecolor='none', alpha=0.5))
    ax.text(col5 + bw/2, 13.8, "USER INTERFACES", ha='center', fontweight='bold', color='#d35400')

    # --- Draw Boxes ---
    # Column 1
    src1 = draw_box(ax, col1, 11.5, bw, bh, "OpenSky Network API\n(Live Global States)", color='#ffffff')
    src2 = draw_box(ax, col1, 9.0, bw, bh, "Local ADS-B Stream\n(RTL-SDR Packets)", color='#ffffff')
    src3 = draw_box(ax, col1, 6.5, bw, bh, "Weather API\n(Wind/Temp Grids)", color='#ffffff')
    src4 = draw_box(ax, col1, 4.0, bw, bh, "Aviation Registry\n(Aircraft Metadata)", color='#ffffff')

    # Column 2
    prep1 = draw_box(ax, col2, 10.25, bw, bh, "Data Fetcher & Streamer\n(Async Polling & Sockets)", color='#ffffff')
    prep2 = draw_box(ax, col2, 7.75, bw, bh, "Noise Filtering &\nInterpolation", color='#ffffff')
    prep3 = draw_box(ax, col2, 5.25, bw, bh, "Multi-modal Fusion\n(State + Geo + Weather)", color='#ffffff')

    # Column 3
    ai1 = draw_box(ax, col3, 11.5, bw, bh, "Trajectory Predictor\n(LSTM & Heuristics)", color='#ffffff', edgecolor='#1abc9c')
    ai2 = draw_box(ax, col3, 9.0, bw, bh, "Future Path\nExtrapolation Engine", color='#ffffff', edgecolor='#1abc9c')
    ai3 = draw_box(ax, col3, 6.5, bw, bh, "Proximity & Conflict\nDetection (Spatial Trees)", color='#ffffff', edgecolor='#e74c3c')
    ai4 = draw_box(ax, col3, 4.0, bw, bh, "Cascade Delay Modeling\n(XGBoost Meta-model)", color='#ffffff', edgecolor='#f39c12')

    # Column 4
    app1 = draw_box(ax, col4, 9.0, bw, bh, "Central State Manager\n(In-memory / Redis Bridge)", color='#ffffff', edgecolor='#f1c40f')
    app2 = draw_box(ax, col4, 6.5, bw, bh, "FastAPI REST Service\n(WebSockets & Endpoints)", color='#ffffff', edgecolor='#f1c40f')

    # Column 5
    ui1 = draw_box(ax, col5, 9.0, bw, bh, "React 3D Globe\n(Interactive Map & Arcs)", color='#ffffff', edgecolor='#e67e22')
    ui2 = draw_box(ax, col5, 6.5, bw, bh, "Streamlit Dashboard\n(Metrics & Charts)", color='#ffffff', edgecolor='#e67e22')


    # --- Draw Arrows ---
    # Col 1 -> Col 2
    draw_arrow(ax, src1['right'], (prep1['left'][0], prep1['left'][1] + 0.3), connectionstyle="arc3,rad=0.1", label="JSON")
    draw_arrow(ax, src2['right'], (prep1['left'][0], prep1['left'][1] - 0.3), connectionstyle="arc3,rad=-0.1", label="Raw Hex")
    draw_arrow(ax, src3['right'], (prep3['left'][0], prep3['left'][1] + 0.3), connectionstyle="arc3,rad=0.1", label="GRIB/JSON")
    draw_arrow(ax, src4['right'], (prep3['left'][0], prep3['left'][1] - 0.3), connectionstyle="arc3,rad=-0.1", label="CSV/DB")

    # Col 2 internal
    draw_arrow(ax, prep1['bottom'], prep2['top'])
    draw_arrow(ax, prep2['bottom'], prep3['top'])

    # Col 2 -> Col 3
    # Fusion to all ML modules
    draw_arrow(ax, prep3['right'], ai1['left'], connectionstyle="arc3,rad=-0.1")
    draw_arrow(ax, prep3['right'], ai3['left'], connectionstyle="arc3,rad=0.1")
    draw_arrow(ax, prep3['right'], ai4['left'], connectionstyle="arc3,rad=0.15")

    # AI internal
    draw_arrow(ax, ai1['bottom'], ai2['top'], label="Velocity Vectors")
    draw_arrow(ax, ai2['bottom'], ai3['top'], label="Extrapolated Points", linestyle="dashed")

    # Col 3 -> Col 4
    draw_arrow(ax, prep3['right'], (app1['left'][0]-1.0, app1['left'][1]+0.8), connectionstyle="arc3,rad=0.3", color='#bdc3c7', linestyle='dashed') # Raw data to state manager
    
    draw_arrow(ax, ai1['right'], (app1['left'][0], app1['left'][1] + 0.4), connectionstyle="arc3,rad=0.1")
    draw_arrow(ax, ai2['right'], (app1['left'][0], app1['left'][1] + 0.1), connectionstyle="arc3,rad=-0.1")
    draw_arrow(ax, ai3['right'], (app1['left'][0], app1['left'][1] - 0.2), connectionstyle="arc3,rad=-0.15")
    draw_arrow(ax, ai4['right'], (app1['left'][0], app1['left'][1] - 0.5), connectionstyle="arc3,rad=-0.2")

    # Col 4 internal
    draw_arrow(ax, app1['bottom'], app2['top'], label="Query State")
    draw_arrow(ax, app2['top'], app1['bottom'], connectionstyle="arc3,rad=-0.5", label="Update Request", linestyle="dashed")

    # Col 4 -> Col 5
    draw_arrow(ax, app2['right'], ui1['left'], connectionstyle="arc3,rad=0.1", label="Polling / WS")
    draw_arrow(ax, app2['right'], ui2['left'], label="REST API")

    # App1 -> UI2 (Streamlit reading state directly)
    draw_arrow(ax, app1['right'], (ui2['left'][0], ui2['left'][1] + 0.5), connectionstyle="arc3,rad=-0.1", label="Direct Bridge", linestyle="dashed")


    plt.xlim(0, 23.5)
    plt.ylim(2.5, 15)
    plt.title("Skyguard AI: Detailed Component Integration Architecture", family='sans-serif', fontsize=18, fontweight='bold', pad=30, color='#2c3e50')
    
    # Save the output
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'skyguard_detailed_architecture.png')
    plt.tight_layout()
    plt.savefig(output_path, bbox_inches='tight', dpi=300)
    print(f"Successfully generated {output_path}")

except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
