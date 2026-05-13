import matplotlib.pyplot as plt
import matplotlib.patches as patches
import sys
import os

try:
    fig, ax = plt.subplots(figsize=(8, 10), dpi=300)
    ax.axis('off')

    def draw_box(ax, x, y, width, height, text, fill=True, color='#f8f9fa', edgecolor='black', text_size=10):
        rect = patches.Rectangle((x, y), width, height, linewidth=1.5, edgecolor=edgecolor, facecolor=color, fill=fill)
        ax.add_patch(rect)
        ax.text(x + width/2, y + height/2, text, horizontalalignment='center', verticalalignment='center', 
                fontsize=text_size, family='serif', fontweight='bold', wrap=True)
        # Returns bottom_mid_x, bottom_y, top_mid_x, top_y, left_x, left_mid_y, right_x, right_mid_y
        return (x + width/2, y, x + width/2, y + height, x, y + height/2, x + width, y + height/2)

    def draw_arrow(ax, x1, y1, x2, y2, connectionstyle="arc3"):
        ax.annotate('', xy=(x2, y2), xytext=(x1, y1), 
                    arrowprops=dict(arrowstyle="->", color='black', lw=1.5, connectionstyle=connectionstyle))

    # IEEE style fonts
    plt.rcParams['font.family'] = 'serif'
    plt.rcParams['font.serif'] = ['Times New Roman', 'DejaVu Serif']

    # Draw boxes
    b1 = draw_box(ax, 2.5, 8.5, 5, 1.0, "1. System Initialization\n(Load XGBoost, LSTM, Meta-Model)")
    b2 = draw_box(ax, 2.5, 7.0, 5, 1.0, "2. Data & User Configuration\n(Select Dataset, Aircraft Tail, Date)")

    # Bounding box for Simulation Engine
    rect_engine = patches.Rectangle((1.5, 1.5), 7, 5.0, linewidth=1.5, edgecolor='black', linestyle='--', facecolor='none')
    ax.add_patch(rect_engine)
    ax.text(1.7, 6.2, "3. Simulation Engine Pipeline", fontsize=11, style='italic', family='serif', fontweight='bold')

    b3 = draw_box(ax, 2.5, 5.2, 5, 0.8, "Base Delay Prediction (XGBoost)", color='white')
    b4 = draw_box(ax, 2.5, 4.0, 5, 0.8, "Spillover Delay Calculation", color='white')
    b5 = draw_box(ax, 2.5, 2.8, 5, 0.8, "Propagated Delay Prediction (LSTM)", color='white')
    b6 = draw_box(ax, 2.5, 1.7, 5, 0.8, "Final Delay Aggregation (Meta-Model)", color='white')

    b7 = draw_box(ax, 2.5, 0.0, 5, 1.0, "4. Output & Visualizations\n(Gantt Timeline, SHAP, Delay Metrics)")

    # Draw arrows
    draw_arrow(ax, b1[0], b1[1], b2[2], b2[3])
    draw_arrow(ax, b2[0], b2[1], b3[2], b3[3])
    draw_arrow(ax, b3[0], b3[1], b4[2], b4[3])
    draw_arrow(ax, b4[0], b4[1], b5[2], b5[3])
    draw_arrow(ax, b5[0], b5[1], b6[2], b6[3])
    draw_arrow(ax, b6[0], b6[1], b7[2], b7[3])

    # Add a loop arrow for flight sequence
    # From Meta-Model back to Base Delay
    ax.annotate('', xy=(b3[6], b3[7]), xytext=(b6[6], b6[7]),
                arrowprops=dict(arrowstyle="->", color='black', lw=1.5,
                                connectionstyle="bar,fraction=0.2", linestyle="dashed"))
    ax.text(b6[6] + 0.8, (b3[7] + b6[7])/2, "Next Flight\nin Chain", 
            horizontalalignment='left', verticalalignment='center', fontsize=9, family='serif', style='italic')


    plt.xlim(0, 10)
    plt.ylim(-0.5, 10)
    plt.title("Aviation Delay Prediction Process Flow", family='serif', fontsize=14, fontweight='bold', pad=20)
    
    output_path = r'C:\Users\BUDCO INDIA\.gemini\antigravity\brain\21efe48a-be81-4bea-96e2-a8c2cce1c73f\artifacts\ieee_process_flow.png'
    plt.tight_layout()
    plt.savefig(output_path, bbox_inches='tight', dpi=300)
    print(f"Successfully generated {output_path}")

except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
