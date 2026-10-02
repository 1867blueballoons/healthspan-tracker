/**
 * SACSI Systemic Vector & Burden Engine
 * Standardized Web Component with High-Contrast Segmented Stepper Track
 */

const BUILD_TIMESTAMP = "2026-09-29 17:35:00 UTC";

const SEVERITY_DEFINITIONS = {
    0: "Baseline / Asymptomatic. Zero impairment, normal physiological function.",
    1: "Sub-Clinical / Nuisance. Noticeable, but entirely ignorable if distracted.",
    2: "Sub-Clinical / Nuisance. Noticeable, but entirely ignorable if distracted.",
    3: "Distracting / Moderate. Continuous cognitive load. You push through.",
    4: "Distracting / Moderate. Continuous cognitive load. You push through.",
    5: "Systemic Friction. Forces active behavioral modification or analgesics.",
    6: "Systemic Friction. Forces active behavioral modification or analgesics.",
    7: "Severe Impairment. Dictates your day. Disrupts physiological baselines.",
    8: "Severe Impairment. Dictates your day. Disrupts physiological baselines.",
    9: "Acute / Debilitating. Complete functional breakdown. Bedridden.",
    10: "Acute / Debilitating. Complete functional breakdown. Bedridden."
};

const SEVERITY_COLORS = {
    0: "#10b981", 1: "#14b8a6", 2: "#14b8a6",
    3: "#f59e0b", 4: "#f59e0b",
    5: "#f97316", 6: "#f97316",
    7: "#ef4444", 8: "#ef4444",
    9: "#991b1b", 10: "#991b1b"
};

const AXES_NAMES = ["Cognitive", "Neurological", "Motor", "Autonomic", "Gastrointestinal", "Affective"];
const AXIS_ICONS = ["🧠", "⚡", "🦾", "💧", "🍽️", "🎭"];

export class SacsiVectorPanel extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
        
        this._state = {
            eventType: 'GENERAL',
            sacsiDepth: 0,
            persistenceBand: 1,
            breadthAxes: { Cognitive: 0, Neurological: 0, Motor: 0, Autonomic: 0, Gastrointestinal: 0, Affective: 0 },
            compositeSbi: 0
        };
    }

    connectedCallback() {
        this._state.eventType = this.getAttribute('event-type') || 'GENERAL';
        this.render();
        this.setupEventListeners();
        this.updateCalculations();
    }

    static get observedAttributes() {
        return ['event-type', 'sacsi-depth', 'persistence-band'];
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue === newValue) return;
        if (name === 'event-type') this._state.eventType = newValue;
        if (name === 'sacsi-depth') this._state.sacsiDepth = parseInt(newValue) || 0;
        if (name === 'persistence-band') this._state.persistenceBand = parseInt(newValue) || 1;
        this.updateCalculations();
    }

    getValue() {
        return { 
            ...this._state,
            controlMechanism: "VERTICAL_STEPPER_TRACK",
            uiOrientation: "TOP_ZERO_BOTTOM_TEN",
            buildTimestamp: BUILD_TIMESTAMP,
            schemaVersion: "1.3"
        };
    }

    setValue(data) {
        if (!data) return;
        this._state.sacsiDepth = parseInt(data.sacsiDepth || data.sacsi_depth || 0);
        this._state.persistenceBand = parseInt(data.persistenceBand || data.persistence_band || 1);
        this._state.breadthAxes = typeof data.breadthAxes === 'object' ? data.breadthAxes : JSON.parse(data.breadth_axes || '{}');
        this.updateCalculations();
    }

    calculateSbi() {
        const s = this._state.sacsiDepth;
        const p = this._state.persistenceBand;
        const bSum = Object.values(this._state.breadthAxes).reduce((a, b) => a + (parseInt(b) || 0), 0);
        
        if (s === 0) return 0;
        let raw = (s * 8) + (p * 3) + (bSum * 3);
        return Math.max(5, Math.min(100, Math.round((raw / 135) * 100)));
    }

    updateCalculations() {
        this._state.compositeSbi = this.calculateSbi();
        this.updateDomElements();
        
        this.dispatchEvent(new CustomEvent('sacsi-change', {
            detail: this.getValue(),
            bubbles: true,
            composed: true
        }));
    }

    updateDomElements() {
        const root = this.shadowRoot;
        if (!root) return;

        const activeColor = SEVERITY_COLORS[this._state.sacsiDepth];

        // Update Stepper Badges
        root.querySelectorAll('.stepper-node').forEach(node => {
            const level = parseInt(node.getAttribute('data-level'));
            if (level === this._state.sacsiDepth) {
                node.classList.add('active');
                node.style.background = activeColor;
                node.style.color = '#ffffff';
            } else {
                node.classList.remove('active');
                node.style.background = '#ffffff';
                node.style.color = '#475569';
            }
        });

        // Update Dynamic Fill Gauge Height (0% at level 0, 100% at level 10)
        const trackGauge = root.querySelector('.track-fill-gauge');
        if (trackGauge) {
            const fillPercent = (this._state.sacsiDepth / 10) * 100;
            trackGauge.style.height = `${fillPercent}%`;
            trackGauge.style.background = activeColor;
        }

        const valDisplay = root.querySelector('.sacsi-val-display');
        if (valDisplay) {
            valDisplay.textContent = `Severity: ${this._state.sacsiDepth}/10`;
            valDisplay.style.borderColor = activeColor;
            valDisplay.style.color = this._state.sacsiDepth > 0 ? activeColor : '#0f172a';
        }

        const anchorText = root.querySelector('.sacsi-text-anchor');
        if (anchorText) anchorText.textContent = SEVERITY_DEFINITIONS[this._state.sacsiDepth];

        const scoreDisplay = root.querySelector('.score-display');
        if (scoreDisplay) scoreDisplay.textContent = `${this._state.compositeSbi} / 100`;

        const drawer = root.querySelector('.threshold-drawer');
        if (drawer) {
            if (this._state.sacsiDepth > 0) drawer.classList.add('open');
            else drawer.classList.remove('open');
        }

        const ball = root.querySelector('.burden-ball');
        if (ball) {
            const score = this._state.compositeSbi;
            const isHayfever = this._state.eventType === 'HAYFEVER';
            if (score === 0) {
                ball.style.width = '8px'; ball.style.height = '8px'; ball.style.boxShadow = 'none'; ball.style.opacity = '0.2';
            } else {
                let size = 14 + (score / 100) * 45;
                let blur = 6 + (score / 100) * 20;
                let opacity = 0.4 + (score / 100) * 0.6;
                ball.style.opacity = '1'; ball.style.width = `${size}px`; ball.style.height = `${size}px`;
                ball.style.boxShadow = isHayfever ? 
                    `0 0 ${blur}px rgba(16, 185, 129, ${opacity})` : 
                    `0 0 ${blur}px rgba(249, 115, 22, ${opacity})`;
            }
        }

        this.renderRadar();
    }

    renderRadar() {
        const svg = this.shadowRoot.querySelector('.radar-svg');
        if (!svg) return;

        const center = 200, radius = 80;
        const isHayfever = this._state.eventType === 'HAYFEVER';
        const strokeHex = isHayfever ? '#10b981' : '#f97316';
        const fillRgba = isHayfever ? 'rgba(16, 185, 129, ' : 'rgba(249, 115, 22, ';

        let html = '';

        AXES_NAMES.forEach((name, i) => {
            let startAngle = (Math.PI / 3) * i - Math.PI / 2 - (Math.PI / 6);
            let endAngle = startAngle + (Math.PI / 3);
            let x1 = center + (radius + 15) * Math.cos(startAngle);
            let y1 = center + (radius + 15) * Math.sin(startAngle);
            let x2 = center + (radius + 15) * Math.cos(endAngle);
            let y2 = center + (radius + 15) * Math.sin(endAngle);

            let sectorPath = `M ${center},${center} L ${x1},${y1} A ${radius + 15} ${radius + 15} 0 0 1 ${x2},${y2} Z`;
            html += `<path d="${sectorPath}" fill="rgba(0,0,0,0.01)" class="sector-touch" data-axis="${name}"><title>${name}</title></path>`;
        });

        for (let r = 1; r <= 3; r++) {
            let rSub = (radius / 3) * r;
            let pts = '';
            for (let i = 0; i < 6; i++) {
                let angle = (Math.PI / 3) * i - Math.PI / 2;
                pts += `${center + rSub * Math.cos(angle)},${center + rSub * Math.sin(angle)} `;
            }
            html += `<polygon points="${pts}" class="radar-grid" />`;
        }

        let polyPts = '';
        AXES_NAMES.forEach((name, i) => {
            let angle = (Math.PI / 3) * i - Math.PI / 2;
            let val = this._state.breadthAxes[name] || 0;
            let rSub = (radius / 3) * val;
            polyPts += `${center + rSub * Math.cos(angle)},${center + rSub * Math.sin(angle)} `;
        });
        html += `<polygon points="${polyPts}" fill="${fillRgba}0.35)" stroke="${strokeHex}" stroke-width="3" pointer-events="none"/>`;

        AXES_NAMES.forEach((name, i) => {
            let angle = (Math.PI / 3) * i - Math.PI / 2;
            let val = this._state.breadthAxes[name] || 0;
            let lx = center + (radius + 60) * Math.cos(angle);
            let ly = center + (radius + 60) * Math.sin(angle);
            let badgeColor = val > 0 ? strokeHex : '#1e293b';

            html += `<g transform="translate(${lx}, ${ly})" class="badge-group" data-axis="${name}">
                <rect x="-55" y="-18" width="110" height="36" rx="8" fill="${badgeColor}" stroke="#000000" stroke-width="2" />
                <text x="0" y="-1" text-anchor="middle" font-size="14" font-weight="800" fill="#ffffff">${AXIS_ICONS[i]} ${name}</text>
                <text x="0" y="13" text-anchor="middle" font-size="12" font-weight="900" fill="#fde047">Lvl ${val}</text>
            </g>`;
        });

        svg.innerHTML = html;
        this.bindRadarEvents();
    }

    bindRadarEvents() {
        const root = this.shadowRoot;
        root.querySelectorAll('.sector-touch, .badge-group').forEach(el => {
            el.addEventListener('click', () => {
                const axis = el.getAttribute('data-axis');
                if (!axis) return;
                let cur = this._state.breadthAxes[axis] || 0;
                this._state.breadthAxes[axis] = (cur + 1) % 4;
                this.updateCalculations();
            });
        });
    }

    setupEventListeners() {
        const root = this.shadowRoot;

        root.querySelectorAll('.stepper-node').forEach(node => {
            node.addEventListener('click', () => {
                const level = parseInt(node.getAttribute('data-level'));
                this._state.sacsiDepth = level;
                this.updateCalculations();
            });
        });

        root.querySelectorAll('.persistence-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const val = parseInt(btn.getAttribute('data-val'));
                this._state.persistenceBand = val;
                
                root.querySelectorAll('.persistence-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                this.updateCalculations();
            });
        });
    }

    render() {
        const levels = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

        this.shadowRoot.innerHTML = `
        <style>
            :host { display: block; font-family: system-ui, -apple-system, sans-serif; }
            .panel-container { background: #ffffff; padding: 1.25rem; border-radius: 1rem; border: 3px solid #000000; box-shadow: 4px 4px 0px #000000; }
            .header-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-bottom: 1rem; }
            .score-display { font-weight: 900; font-size: 1rem; padding: 0.35rem 0.6rem; border-radius: 0.375rem; background: #fef3c7; color: #b45309; border: 2px solid #000000; }
            
            .grid-layout { display: grid; grid-template-columns: 85px 1fr; gap: 1.25rem; align-items: center; }

            /* Modern Stepper Track Frame */
            .stepper-box { 
                display: flex; 
                flex-direction: column; 
                align-items: center; 
                background: #f8fafc; 
                padding: 0.75rem 0.35rem; 
                border-radius: 0.75rem; 
                border: 3px solid #000000;
                box-shadow: 2px 2px 0px #000000;
                position: relative;
            }

            .track-line-wrapper {
                position: relative;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                align-items: center;
                gap: 4px;
                width: 100%;
                margin: 0.5rem 0;
            }

            /* Dynamic Background Gauge Bar */
            .track-fill-gauge {
                position: absolute;
                top: 0;
                left: 50%;
                transform: translateX(-50%);
                width: 6px;
                background: #10b981;
                border-radius: 3px;
                transition: height 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.25s ease;
                z-index: 1;
            }

            /* Level Stepper Node Buttons */
            .stepper-node {
                position: relative;
                z-index: 2;
                width: 100%;
                padding: 0.25rem 0;
                font-size: 0.75rem;
                font-weight: 900;
                text-align: center;
                border-radius: 6px;
                border: 2px solid #000000;
                background: #ffffff;
                color: #475569;
                cursor: pointer;
                user-select: none;
                transition: transform 0.15s ease, background 0.2s ease, color 0.2s ease;
                box-shadow: 1px 1px 0px rgba(0,0,0,0.15);
            }

            .stepper-node:hover {
                transform: scale(1.06);
            }

            .stepper-node.active {
                box-shadow: 2px 2px 0px #000000;
                transform: scale(1.1);
            }

            .radar-box { display: flex; flex-direction: column; align-items: center; justify-content: space-between; width: 100%; overflow: hidden; }
            .radar-header { display: flex; justify-content: space-between; width: 100%; align-items: center; padding: 0 0.25rem; }
            .sacsi-val-display { font-weight: 900; font-size: 0.85rem; padding: 0.35rem 0.6rem; border-radius: 0.375rem; background: #f1f5f9; border: 2px solid #000000; transition: border-color 0.2s ease; }
            .burden-ball { border-radius: 50%; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); border: 1px solid #000000; }
            
            .radar-svg { width: 100%; height: auto; max-width: 400px; display: block; overflow: visible; }

            .radar-grid { fill: none; stroke: #94a3b8; stroke-dasharray: 3 3; stroke-width: 1.5; }
            .sector-touch { cursor: pointer; }
            .badge-group { cursor: pointer; }

            .benchmark-banner { background: #f8fafc; padding: 0.75rem; border-radius: 0.5rem; border: 2px solid #000000; text-align: center; margin-top: 1rem; }
            .sacsi-text-anchor { font-size: 0.85rem; font-weight: 600; color: #1e293b; margin: 0; }

            .threshold-drawer { max-height: 0; opacity: 0; overflow: hidden; transition: max-height 0.4s ease, opacity 0.3s ease; margin-top: 0.5rem; }
            .threshold-drawer.open { max-height: 500px; opacity: 1; }
            
            .persistence-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.35rem; margin-top: 0.5rem; }
            .persistence-btn { padding: 0.45rem 0.2rem; border-radius: 0.5rem; background: #ffffff; border: 2px solid #000000; text-align: center; cursor: pointer; font-size: 0.75rem; font-weight: 700; }
            .persistence-btn.active { background: #e11d48; color: #ffffff; border-color: #000000; box-shadow: 2px 2px 0px #000000; }
        </style>

        <div class="panel-container">
            <div class="header-bar">
                <span style="font-size: 0.85rem; font-weight: 900; color: #0f172a; text-transform: uppercase;">Topological SACSI Panel</span>
                <span style="font-size: 0.65rem; font-weight: 700; color: #64748b;">${BUILD_TIMESTAMP}</span>
                <span class="score-display">0 / 100</span>
            </div>

            <div class="grid-layout">
                <div class="stepper-box">
                    <span style="font-size: 0.65rem; font-weight: 900; color: #10b981; text-transform: uppercase;">TOP = 0</span>
                    
                    <div class="track-line-wrapper">
                        <div class="track-fill-gauge"></div>
                        ${levels.map(lvl => `
                            <div class="stepper-node ${lvl === 0 ? 'active' : ''}" data-level="${lvl}">
                                Lvl ${lvl}
                            </div>
                        `).join('')}
                    </div>

                    <span style="font-size: 0.65rem; font-weight: 900; color: #991b1b; text-transform: uppercase;">BOT = 10</span>
                </div>

                <div class="radar-box">
                    <div class="radar-header">
                        <span class="sacsi-val-display">Severity: 0/10</span>
                        <div style="display: flex; align-items: center; gap: 0.4rem;">
                            <span style="font-size: 0.7rem; font-weight: 800; color: #64748b; text-transform: uppercase;">Burden:</span>
                            <div class="burden-ball" style="width: 8px; height: 8px; opacity: 0.2; background: #f97316;"></div>
                        </div>
                    </div>

                    <svg class="radar-svg" viewBox="0 0 400 360"></svg>
                </div>
            </div>

            <div class="benchmark-banner">
                <span style="font-size: 0.7rem; font-weight: 900; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 0.25rem;">Severity Benchmark</span>
                <p class="sacsi-text-anchor">Baseline / Asymptomatic. Zero impairment, normal physiological function.</p>
            </div>

            <div class="threshold-drawer">
                <span style="font-size: 0.7rem; font-weight: 900; color: #0f172a; text-transform: uppercase;">Persistence Band</span>
                <div class="persistence-grid">
                    <button class="persistence-btn active" data-val="1"><strong>&lt;30m</strong><br><span style="font-size: 0.6rem;">Transient</span></button>
                    <button class="persistence-btn" data-val="2"><strong>30m-2h</strong><br><span style="font-size: 0.6rem;">Episodic</span></button>
                    <button class="persistence-btn" data-val="3"><strong>2h-6h</strong><br><span style="font-size: 0.6rem;">Extended</span></button>
                    <button class="persistence-btn" data-val="4"><strong>6h-16h</strong><br><span style="font-size: 0.6rem;">Persistent</span></button>
                    <button class="persistence-btn" data-val="5"><strong>&gt;16h</strong><br><span style="font-size: 0.6rem;">Diurnal</span></button>
                </div>
            </div>
        </div>
        `;
    }
}

if (!customElements.get('sacsi-vector-panel')) {
    customElements.define('sacsi-vector-panel', SacsiVectorPanel);
}