import matplotlib.pyplot as plt
import matplotlib.patches as patches
import sys
import os

try:
    fig, ax = plt.subplots(figsize=(9, 11), dpi=300)
    ax.axis('off')

    def draw_box(ax, x, y, width, height, text, fill=True, color='#f8f9fa', edgecolor='black', text_size=10):
        rect = patches.Rectangle((x, y), width, height, linewidth=1.5, edgecolor=edgecolor, facecolor=color, fill=fill)
        ax.add_patch(rect)
        ax.text(x + width/2, y + height/2, text, horizontalalignment='center', verticalalignment='center', 
                fontsize=text_size, family='serif', fontweight='bold', wrap=True)
        return (x + width/2, y, x + width/2, y + height, x, y + height/2, x + width, y + height/2)

    def draw_arrow(ax, x1, y1, x2, y2, connectionstyle="arc3"):
        ax.annotate('', xy=(x2, y2), xytext=(x1, y1), 
                    arrowprops=dict(arrowstyle="->", color='black', lw=1.5, connectionstyle=connectionstyle))

    # IEEE style fonts
    plt.rcParams['font.family'] = 'serif'
    plt.rcParams['font.serif'] = ['Times New Roman', 'DejaVu Serif']

    # Draw boxes
    b1 = draw_box(ax, 2.0, 9.5, 6, 1.0, "1. Real-time Data Ingestion\n(OpenSky API, Local ADS-B Stream, Weather)")
    b2 = draw_box(ax, 2.0, 8.0, 6, 1.0, "2. Data Processing & Contextualization\n(Noise Filtering, State Merging, Geo-Context)")

    # Bounding box for Core AI Analytics Engine
    rect_engine = patches.Rectangle((1.0, 3.5), 8, 4.0, linewidth=1.5, edgecolor='black', linestyle='--', facecolor='none')
    ax.add_patch(rect_engine)
    ax.text(1.2, 7.2, "3. Core AI Analytics Engine", fontsize=11, style='italic', family='serif', fontweight='bold')

    b3 = draw_box(ax, 1.5, 6.0, 3.2, 1.0, "Trajectory Prediction\n(LSTM & Heuristic Models)", color='white')
    b4 = draw_box(ax, 5.3, 6.0, 3.2, 1.0, "Cascade Delay Modeling\n(XGBoost + LSTM Meta-model)", color='white')
    
    b5 = draw_box(ax, 2.0, 4.0, 6, 1.0, "Conflict & Anomaly Detection\n(Spatial Thresholds & Proximity Alerts)", color='white')

    b6 = draw_box(ax, 2.0, 1.5, 6, 1.0, "4. Real-time Visualization & Frontend\n(3D Interactive Globe, Streamlit Dashboard)")

    # Draw arrows main flow
    draw_arrow(ax, b1[0], b1[1], b2[2], b2[3])
    
    # Branching arrows from Data Processing to Trajectory and Delay Modeling
    ax.annotate('', xy=(b3[2], b3[3]), xytext=(b2[0], b2[1]), 
                arrowprops=dict(arrowstyle="->", color='black', lw=1.5, connectionstyle="angle,angleA=90,angleB=180,rad=0"))
    ax.annotate('', xy=(b4[2], b4[3]), xytext=(b2[0], b2[1]), 
                arrowprops=dict(arrowstyle="->", color='black', lw=1.5, connectionstyle="angle,angleA=90,angleB=0,rad=0"))

    # Arrows from Sub-engines to Conflict Detection
    draw_arrow(ax, b3[0], b3[1], b5[2]-1.5, b5[3])
    draw_arrow(ax, b4[0], b4[1], b5[2]+1.5, b5[3])

    # Arrow to Visualization
    draw_arrow(ax, b5[0], b5[1], b6[2], b6[3])

    # Feedback loop for continuous updates
    ax.annotate('', xy=(b1[6], b1[7]), xytext=(b6[6], b6[7]),
                arrowprops=dict(arrowstyle="->", color='black', lw=1.5,
                                connectionstyle="bar,fraction=0.1", linestyle="dashed"))
    ax.text(b6[6] + 0.8, (b1[7] + b6[7])/2, "Continuous\nState Updates", 
            horizontalalignment='left', verticalalignment='center', fontsize=9, family='serif', style='italic')

    plt.xlim(0, 10)
    plt.ylim(0, 11.5)
    plt.title("Skyguard AI: Integrated Aviation Analytics Architecture", family='serif', fontsize=14, fontweight='bold', pad=20)
    
    # Save the output in the current project directory so the user can see it easily
    output_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'skyguard_overall_flowchart.png')
    plt.tight_layout()
    plt.savefig(output_path, bbox_inches='tight', dpi=300)
    print(f"Successfully generated {output_path}")

except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
