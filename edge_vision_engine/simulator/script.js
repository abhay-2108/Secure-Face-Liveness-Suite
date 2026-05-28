// =====================================================================
// 1. Simulation Constants & Performance Presets
// =====================================================================

// Hardware CPU multiplier & constraints
const HARDWARE_PRESETS = {
    low: {
        name: "Low-End Device (3GB RAM, Android 8+)",
        cpuMultiplier: 3.2,
        ramBaseline: 2.1, // MB overhead with mmap
        powerBase: 650,    // mW
        fpsMultiplier: 0.6
    },
    mid: {
        name: "Mid-Range Device (4GB RAM, Android 10+)",
        cpuMultiplier: 1.4,
        ramBaseline: 2.4, // MB overhead with mmap
        powerBase: 420,    // mW
        fpsMultiplier: 1.0
    },
    flagship: {
        name: "Flagship Device (8GB RAM, iOS 15+)",
        cpuMultiplier: 0.35,
        ramBaseline: 2.8, // MB overhead with mmap
        powerBase: 250,    // mW
        fpsMultiplier: 1.8
    }
};

// Lighting effect on accuracy & noise margins
const LIGHTING_PRESETS = {
    optimal: {
        name: "Optimal (Indoor Toll Office)",
        baseAccuracy: 0.988,
        claheAccuracy: 0.991,
        lumNoise: 0.02
    },
    noon: {
        name: "Extreme Sunlight (Washout)",
        baseAccuracy: 0.781,
        claheAccuracy: 0.968,
        lumNoise: 0.28
    },
    shadow: {
        name: "Canopy Shadow (Deep Contrast)",
        baseAccuracy: 0.723,
        claheAccuracy: 0.959,
        lumNoise: 0.35
    },
    night: {
        name: "Dim Night Operation",
        baseAccuracy: 0.654,
        claheAccuracy: 0.912,
        lumNoise: 0.45
    }
};

// Baseline execution time in milliseconds (on normalized mid-range hardware)
const BASELINE_LATENCY = {
    clahe: 4.2,      // Native C++ CLAHE target
    detection: 12.0, // Ultra-light-fast detector (Linzaer)
    fas: {
        passive: 110.0,
        active_basic: 220.0,
        active_full: 340.0 // passive spatial-Fourier + optical flow vectors
    },
    recognition: 180.0 // GhostFaceNet-S inference
};

// =====================================================================
// 2. Global State Variables
// =====================================================================
let activeHardware = "mid";
let activeLighting = "shadow";
let isClaheEnabled = true;
let frameSkipValue = 3;
let livenessMode = "active_full";

let budgetChart = null;

// =====================================================================
// 3. Main Simulator Computation Core
// =====================================================================
function runSimulation() {
    const hw = HARDWARE_PRESETS[activeHardware];
    const light = LIGHTING_PRESETS[activeLighting];

    // --- A. Calculate Pipeline Latency Components ---
    // Preprocessing Latency
    const timePreproc = isClaheEnabled ? (BASELINE_LATENCY.clahe * hw.cpuMultiplier) : 0.0;
    
    // Face Detection Latency (skipping frames reduces UI cycle overhead slightly)
    const timeDetect = BASELINE_LATENCY.detection * hw.cpuMultiplier;
    
    // FAS Liveness (based on complexity preset)
    const rawFasTime = BASELINE_LATENCY.fas[livenessMode];
    const timeLiveness = rawFasTime * hw.cpuMultiplier;
    
    // Face Recognition (triggered every frameSkipValue cycles to conserve battery)
    const timeRecogn = BASELINE_LATENCY.recognition * hw.cpuMultiplier;

    // Total execution latency for a single aligned recognition event
    const totalLatency = timePreproc + timeDetect + timeLiveness + timeRecogn;

    // --- B. Calculate Demographic Accuracy ---
    let finalAccuracy = isClaheEnabled ? light.claheAccuracy : light.baseAccuracy;
    
    // If liveness mode is basic, apply minor accuracy deduction due to security spoofing vulnerability
    if (livenessMode === "passive") {
        finalAccuracy -= 0.02; // Printed photograph fraud penalty
    }

    // --- C. Compute Memory & Power Overhead ---
    // Our TFLite model weights load via memory-mapped weights (mmap). 
    // This allows weights to stay on flash memory instead of consuming active application heap.
    const activeRAM = hw.ramBaseline + 0.8; // 800KB direct pointer allocation buffer
    
    // Active battery power drain estimates based on processing duty cycle
    const dutyCycleFPS = 30.0 / frameSkipValue;
    const powerUtilization = hw.powerBase * (dutyCycleFPS / 10.0) * (isClaheEnabled ? 1.05 : 1.0);

    // --- D. Update Dashboard Text Metrics ---
    updateUIIndicators(totalLatency, finalAccuracy, activeRAM, powerUtilization);

    // --- E. Update Dynamic Chart Data ---
    updateChart(timePreproc, timeDetect, timeLiveness, timeRecogn);

    // --- F. Refresh Sizing Alerts & Warnings ---
    updateStatusAlertBox(totalLatency, finalAccuracy, activeRAM);
}

// =====================================================================
// 4. UI Rendering & Animations
// =====================================================================
function updateUIIndicators(latency, accuracy, ram, power) {
    // 1. Latency display with caution flashing if close to threshold
    const latEl = document.getElementById("val-latency");
    latEl.innerText = `${Math.round(latency)} ms`;
    
    const latSub = document.getElementById("sub-latency");
    if (latency > 1000) {
        latEl.style.color = "var(--danger)";
        latSub.innerText = "⚠️ EXCEEDS 1S CRITICAL BUDGET";
        latSub.style.color = "var(--danger)";
    } else if (latency > 600) {
        latEl.style.color = "var(--warning)";
        latSub.innerText = "⚠️ Elevated edge latency";
        latSub.style.color = "var(--warning)";
    } else {
        latEl.style.color = "var(--primary)";
        latSub.innerText = "✓ Under 1.0s budget target";
        latSub.style.color = "var(--text-secondary)";
    }

    // 2. Demographic Accuracy
    const accEl = document.getElementById("val-accuracy");
    const accPercent = (accuracy * 100).toFixed(1);
    accEl.innerText = `${accPercent}%`;
    
    const accSub = document.getElementById("sub-accuracy");
    if (accuracy >= 0.95) {
        accEl.style.color = "var(--success)";
        accSub.innerText = "✓ Exceeds 95% NHAI criteria";
        accSub.style.color = "var(--text-secondary)";
    } else {
        accEl.style.color = "var(--danger)";
        accSub.innerText = "⚠️ Fails standard demographic limit";
        accSub.style.color = "var(--danger)";
    }

    // 3. RAM Memory Footprint
    const ramEl = document.getElementById("val-memory");
    ramEl.innerText = `${ram.toFixed(2)} MB`;
    
    const ramSub = document.getElementById("sub-memory");
    ramSub.innerText = "✓ Saved via mmap mapping";

    // 4. Power consumption
    const batEl = document.getElementById("val-battery");
    batEl.innerText = `${Math.round(power)} mW`;
    
    const batSub = document.getElementById("sub-battery");
    if (power > 600) {
        batSub.innerText = "Moderate heating risk";
        batSub.style.color = "var(--warning)";
    } else {
        batSub.innerText = "Ultra-low thermal load";
        batSub.style.color = "var(--text-secondary)";
    }

    // Update detailed sub-metrics table panel
    document.getElementById("time-preproc").innerText = `${latency > 0 ? timePreprocText(latency) : "0.0"} ms`;
}

function timePreprocText(total) {
    const hw = HARDWARE_PRESETS[activeHardware];
    const timePreproc = isClaheEnabled ? (BASELINE_LATENCY.clahe * hw.cpuMultiplier) : 0.0;
    const timeDetect = BASELINE_LATENCY.detection * hw.cpuMultiplier;
    const rawFasTime = BASELINE_LATENCY.fas[livenessMode];
    const timeLiveness = rawFasTime * hw.cpuMultiplier;
    const timeRecogn = BASELINE_LATENCY.recognition * hw.cpuMultiplier;

    document.getElementById("time-preproc").innerText = `${timePreproc.toFixed(1)} ms`;
    document.getElementById("time-detect").innerText = `${timeDetect.toFixed(1)} ms`;
    document.getElementById("time-liveness").innerText = `${timeLiveness.toFixed(1)} ms`;
    document.getElementById("time-recogn").innerText = `${timeRecogn.toFixed(1)} ms`;
}

function updateStatusAlertBox(latency, accuracy, ram) {
    const card = document.getElementById("status-card");
    const icon = document.getElementById("status-icon");
    const title = document.getElementById("status-title");
    const desc = document.getElementById("status-desc");

    card.className = "status-alert-box"; // reset classes
    
    if (latency > 1000) {
        card.classList.add("alert-danger");
        icon.innerText = "✕";
        title.innerText = "Hardware CPU Throttled";
        desc.innerText = "Warning: Total latency exceeds the 1.0-second constraint. The device is experiencing scheduling overhead due to excessive active active liveness or low hardware capabilities. Boost frame-skipping or optimize liveness levels to restore performance.";
    } else if (accuracy < 0.95) {
        card.classList.add("alert-warning");
        icon.innerText = "!";
        title.innerText = "Accuracy Degradation Alert";
        desc.innerText = "Warning: Demographic recognition accuracy has plummeted to " + (accuracy * 100).toFixed(1) + "% due to extreme environmental reflections and dark shadows. Proactively toggle our Native C++ CLAHE equalization stage to balance luminance arrays.";
    } else {
        icon.innerText = "✓";
        title.innerText = "All Constraints Met Successfully";
        desc.innerText = "System operates within optimal budgets. Quantized model footprint (8.12 MB) satisfies 20MB local flash memory rules. Direct pointer memory allocation and memory-mapped weights secure flawless executions on Android 8+ devices.";
    }
}

// =====================================================================
// 5. Chart.js Implementation
// =====================================================================
function initChart() {
    const ctx = document.getElementById('budgetChart').getContext('2d');
    
    budgetChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Preprocessing (CLAHE)', 'Face Detection', 'FAS Liveness', 'ArcFace Recognition'],
            datasets: [{
                label: 'Inference Latency (ms)',
                data: [0, 0, 0, 0],
                backgroundColor: [
                    'rgba(0, 242, 254, 0.7)',
                    'rgba(79, 172, 254, 0.7)',
                    'rgba(16, 185, 129, 0.7)',
                    'rgba(245, 158, 11, 0.7)'
                ],
                borderColor: [
                    '#00f2fe',
                    '#4facfe',
                    '#10b981',
                    '#f59e0b'
                ],
                borderWidth: 1.5,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: {
                        color: '#212946'
                    },
                    ticks: {
                        color: '#94a3b8',
                        font: {
                            family: 'Inter'
                        }
                    },
                    title: {
                        display: true,
                        text: 'Execution Time (milliseconds)',
                        color: '#94a3b8'
                    }
                },
                y: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        color: '#f1f5f9',
                        font: {
                            family: 'Outfit',
                            weight: 500
                        }
                    }
                }
            }
        }
    });
}

function updateChart(preproc, detect, liveness, recognition) {
    if (budgetChart) {
        budgetChart.data.datasets[0].data = [preproc, detect, liveness, recognition];
        budgetChart.update();
    }
}

// =====================================================================
// 6. Interaction Handlers & Export Setup
// =====================================================================
function setupEventListeners() {
    // 1. Hardware Select Preset Selector
    document.getElementById("hardware-preset").addEventListener("change", function(e) {
        activeHardware = e.target.value;
        runSimulation();
    });

    // 2. Lighting conditions Preset Selector
    document.getElementById("lighting-preset").addEventListener("change", function(e) {
        activeLighting = e.target.value;
        runSimulation();
    });

    // 3. CLAHE Switch Toggler
    document.getElementById("toggle-clahe").addEventListener("change", function(e) {
        isClaheEnabled = e.target.checked;
        runSimulation();
    });

    // 4. Frame Skipping Slider Input
    const skipSlider = document.getElementById("slider-frame-skip");
    const skipValLabel = document.getElementById("val-frame-skip");
    
    skipSlider.addEventListener("input", function(e) {
        frameSkipValue = parseInt(e.target.value);
        skipValLabel.innerText = frameSkipValue;
        runSimulation();
    });

    // 5. FAS Liveness Selector
    document.getElementById("liveness-mode").addEventListener("change", function(e) {
        livenessMode = e.target.value;
        runSimulation();
    });

    // 6. CSV Export Button
    document.getElementById("btn-export").addEventListener("click", exportBenchmarkCSV);
}

function exportBenchmarkCSV() {
    const hw = HARDWARE_PRESETS[activeHardware];
    const light = LIGHTING_PRESETS[activeLighting];
    
    // Perform quick latency components calculation
    const timePreproc = isClaheEnabled ? (BASELINE_LATENCY.clahe * hw.cpuMultiplier) : 0.0;
    const timeDetect = BASELINE_LATENCY.detection * hw.cpuMultiplier;
    const rawFasTime = BASELINE_LATENCY.fas[livenessMode];
    const timeLiveness = rawFasTime * hw.cpuMultiplier;
    const timeRecogn = BASELINE_LATENCY.recognition * hw.cpuMultiplier;
    const totalLatency = timePreproc + timeDetect + timeLiveness + timeRecogn;
    let finalAccuracy = isClaheEnabled ? light.claheAccuracy : light.baseAccuracy;
    if (livenessMode === "passive") finalAccuracy -= 0.02;

    // Define CSV header structure
    const headers = [
        "Hardware Target Preset", "CPU Multiplier", "Lighting Environment", "Native CLAHE Preprocessing Enabled", 
        "FAS Complexity Mode", "Frame Skipping Interval (Frames)", "Preprocessing Latency (ms)", 
        "Face Detection Latency (ms)", "Liveness Latency (ms)", "Recognition Latency (ms)", 
        "Total Pipeline Latency (ms)", "Demographic Accuracy Score (%)", "Edge RAM Allocation (MB)"
    ];
    
    const row = [
        `"${hw.name}"`, hw.cpuMultiplier, `"${light.name}"`, isClaheEnabled ? "TRUE" : "FALSE", 
        `"${livenessMode}"`, frameSkipValue, timePreproc.toFixed(2), 
        timeDetect.toFixed(2), timeLiveness.toFixed(2), timeRecogn.toFixed(2), 
        totalLatency.toFixed(2), (finalAccuracy * 100).toFixed(2), (hw.ramBaseline + 0.8).toFixed(2)
    ];

    const csvContent = [headers.join(","), row.join(",")].join("\n");
    
    // Create direct in-browser download binary blob
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "nhai_edge_ai_feasibility_benchmarks.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function scrollToElement(id) {
    const el = document.getElementById(id);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth' });
    }
}

// Update clock timestamp
function updateClock() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    
    const formattedDate = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ` +
                          `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
    
    const timeEl = document.getElementById("live-time");
    if (timeEl) {
        timeEl.innerText = formattedDate;
    }
}

// =====================================================================
// 7. System Initialization
// =====================================================================
window.addEventListener('DOMContentLoaded', () => {
    initChart();
    setupEventListeners();
    runSimulation();
    
    // Sync clock
    updateClock();
    setInterval(updateClock, 1000);
});
