/**
 * SACSI Systemic Vector & Burden Engine
 * Standardized Custom Web Component with Top=0 / Bot=10 Vertical Slider
 */

const SEVERITY_DEFINITIONS = {
    0: "Baseline / Asymptomatic. Zero impairment, normal physiological function.",
    1: "Sub-Clinical / Nuisance. Noticeable, but entirely ignorable if distracted. Zero routine modification.",
    2: "Sub-Clinical / Nuisance. Noticeable, but entirely ignorable if distracted. Zero routine modification.",
    3: "Distracting / Moderate. Continuous cognitive load. You cannot ignore it, but you push through.",
    4: "Distracting / Moderate. Continuous cognitive load. You cannot ignore it, but you push through.",
    5: "Systemic Friction. Forces active behavioral modification: take analgesic or scale back workout.",
    6: "Systemic Friction. Forces active behavioral modification: take analgesic or scale back workout.",
    7: "Severe Impairment. Dictates your day. Disrupts physiological baselines: wakes you, cancels training.",
    8: "Severe Impairment. Dictates your day. Disrupts physiological baselines: wakes you, cancels training.",
    9: "Acute / Debilitating. Complete functional breakdown. Bedridden, incapacitated.",
    10: "Acute / Debilitating. Complete functional breakdown. Bedridden, incapacitated."
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
        return { ...this._state };
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

        const slider = root.querySelector('.vertical-range');
        if (slider) slider.value = this._state.sacsiDepth;

        const valDisplay = root.querySelector('.sacsi-val-display');
        if (valDisplay) valDisplay.textContent = `Severity: ${this._state.sacsiDepth}/10`;

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

        // Expanded bounds (500x440) to accommodate larger badge sizing and mobile spacing
        const center = 250, radius = 100;
        const isHayfever = this._state.eventType === 'HAYFEVER';
        const strokeHex = isHayfever ? '#10b981' : '#f97316';
        const fillRgba = isHayfever ? 'rgba(16, 185, 129, ' : 'rgba(249, 115, 22, ';

        let html = '';

        AXES_NAMES.forEach((name, i) => {
            let startAngle = (Math.PI / 3) * i - Math.PI / 2 - (Math.PI / 6);
            let endAngle = startAngle + (Math.PI / 3);
            let x1 = center + (radius + 20) * Math.cos(startAngle);
            let y1 = center + (radius + 20) * Math.sin(startAngle);
            let x2 = center + (radius + 20) * Math.cos(endAngle);
            let y2 = center + (radius + 20) * Math.sin(endAngle);

            let sectorPath = `M ${center},${center} L ${x1},${y1} A ${radius + 20} ${radius + 20} 0 0 1 ${x2},${y2} Z`;
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
            let lx = center + (radius + 70) * Math.cos(angle);
            let ly = center + (radius + 70) * Math.sin(angle);
            let badgeColor = val > 0 ? strokeHex : '#1e293b';

            // Doubled font size (18px / 16px) and high-contrast styling
            html += `<g transform="translate(${lx}, ${ly})" class="badge-group" data-axis="${name}">
                <rect x="-65" y="-22" width="130" height="44" rx="10" fill="${badgeColor}" stroke="#000" stroke-width="2" />
                <text x="0" y="-2" text-anchor="middle" font-size="18" font-weight="800" fill="#ffffff">${AXIS_ICONS[i]} ${name}</text>
                <text x="0" y="15" text-anchor="middle" font-size="15" font-weight="900" fill="#fde047">Lvl ${val}</text>
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

        const slider = root.querySelector('.vertical-range');
        if (slider) {
            slider.addEventListener('input', (e) => {
                this._state.sacsiDepth = parseInt(e.target.value);
                this.updateCalculations();
            });
        }

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
        this.shadowRoot.innerHTML = `
        <style>
            :host { display: block; font-family: system-ui, -apple-system, sans-serif; }
            .panel-container { background: #ffffff; padding: 1rem; border-radius: 0.75rem; border: 3px solid #000000; box-shadow: 4px 4px 0px #000000; }
            .header-bar { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 0.5rem; margin-bottom: 1rem; }
            .score-display { font-weight: 900; font-size: 1rem; padding: 0.35rem 0.6rem; border-radius: 0.375rem; background: #fef3c7; color: #b45309; border: 2px solid #000000; }
            
            /* Responsive Grid Layout */
            .grid-layout { display: grid; grid-template-columns: repeat(12, 1fr); gap: 1rem; align-items: center; }
            
            @media (max-width: 640px) {
                .grid-layout { display: flex; flex-direction: column; }
                .slider-box { width: 100%; flex-direction: row !important; justify-content: space-between; height: auto !important; padding: 0.75rem 1rem !important; }
                .vertical-range { writing-mode: horizontal-tb !important; direction: ltr !important; width: 100% !important; height: 16px !important; margin: 0 0.75rem; }
                .radar-box { width: 100%; }
            }

            .slider-box { grid-column: span 3; display: flex; flex-direction: column; align-items: center; background: #f8fafc; padding: 0.75rem 0.5rem; border-radius: 0.5rem; border: 2px solid #000000; }
            
            /* CORRECTED TOP-DOWN VERTICAL SLIDER (TOP = 0, BOTTOM = 10) */
            .vertical-range { 
                writing-mode: vertical-lr; 
                direction: ltr; /* Corrects axis orientation so Top is 0, Bottom is 10 */
                appearance: none;
                -webkit-appearance: none;
                width: 18px; 
                height: 220px; 
                background: #cbd5e1;
                border-radius: 8px;
                outline: none;
                cursor: pointer; 
            }
            .vertical-range::-webkit-slider-thumb {
                appearance: none;
                -webkit-appearance: none;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                background: #2563eb;
                cursor: pointer;
                border: 3px solid #000000;
                box-shadow: 0 2px 4px rgba(0,0,0,0.3);
            }

            .radar-box { grid-column: span 9; display: flex; flex-direction: column; align-items: center; justify-content: space-between; height: 100%; width: 100%; }
            .radar-header { display: flex; justify-content: space-between; width: 100%; align-items: center; }
            .sacsi-val-display { font-weight: 900; font-size: 0.9rem; padding: 0.35rem 0.6rem; border-radius: 0.375rem; background: #f1f5f9; border: 2px solid #000000; }
            .burden-ball { border-radius: 50%; transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1); border: 1px solid #000000; }
            
            .radar-svg { width: 100%; height: auto; max-width: 500px; display: block; overflow: visible; }

            .radar-grid { fill: none; stroke: #94a3b8; stroke-dasharray: 3 3; stroke-width: 1.5; }
            .sector-touch { cursor: pointer; }
            .badge-group { cursor: pointer; transition: transform 0.1s ease; }
            .badge-group:hover { transform: scale(1.05); }

            .benchmark-banner { background: #f8fafc; padding: 0.75rem; border-radius: 0.5rem; border: 2px solid #000000; text-align: center; margin-top: 1rem; }
            .sacsi-text-anchor { font-size: 0.85rem; font-weight: 600; color: #1e293b; margin: 0; }

            .threshold-drawer { max-height: 0; opacity: 0; overflow: hidden; transition: max-height 0.4s ease, opacity 0.3s ease; margin-top: 0.5rem; }
            .threshold-drawer.open { max-height: 500px; opacity: 1; }
            
            .persistence-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 0.5rem; margin-top: 0.5rem; }
            .persistence-btn { padding: 0.5rem; border-radius: 0.5rem; background: #ffffff; border: 2px solid #000000; text-align: center; cursor: pointer; font-size: 0.8rem; font-weight: 700; }
            .persistence-btn.active { background: #e11d48; color: #ffffff; border-color: #000000; box-shadow: 2px 2px 0px #000000; }
        </style>

        <div class="panel-container">
            <div class="header-bar">
                <span style="font-size: 0.85rem; font-weight: 900; color: #0f172a; text-transform: uppercase;">Topological SACSI Panel</span>
                <span class="score-display">0 / 100</span>
            </div>

            <div class="grid-layout">
                <div class="slider-box">
                    <span style="font-size: 0.75rem; font-weight: 900; color: #000000; text-transform: uppercase;">Top = 0</span>
                    <input type="range" min="0" max="10" value="0" class="vertical-range" />
                    <span style="font-size: 0.75rem; font-weight: 900; color: #e11d48; text-transform: uppercase;">Bot = 10</span>
                </div>

                <div class="radar-box">
                    <div class="radar-header">
                        <span class="sacsi-val-display">Severity: 0/10</span>
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="font-size: 0.75rem; font-weight: 800; color: #64748b; text-transform: uppercase;">Burden:</span>
                            <div class="burden-ball" style="width: 8px; height: 8px; opacity: 0.2; background: #f97316;"></div>
                        </div>
                    </div>

                    <svg class="radar-svg" viewBox="0 0 500 440"></svg>
                </div>
            </div>

            <div class="benchmark-banner">
                <span style="font-size: 0.7rem; font-weight: 900; color: #64748b; text-transform: uppercase; display: block; margin-bottom: 0.25rem;">Severity Benchmark</span>
                <p class="sacsi-text-anchor">Baseline / Asymptomatic. Zero impairment, normal physiological function.</p>
            </div>

            <div class="threshold-drawer">
                <span style="font-size: 0.7rem; font-weight: 900; color: #0f172a; text-transform: uppercase;">Persistence Band</span>
                <div class="persistence-grid">
                    <button class="persistence-btn active" data-val="1"><strong>&lt;30m</strong><br><span style="font-size: 0.65rem;">Transient</span></button>
                    <button class="persistence-btn" data-val="2"><strong>30m-2h</strong><br><span style="font-size: 0.65rem;">Episodic</span></button>
                    <button class="persistence-btn" data-val="3"><strong>2h-6h</strong><br><span style="font-size: 0.65rem;">Extended</span></button>
                    <button class="persistence-btn" data-val="4"><strong>6h-16h</strong><br><span style="font-size: 0.65rem;">Persistent</span></button>
                    <button class="persistence-btn" data-val="5"><strong>&gt;16h</strong><br><span style="font-size: 0.65rem;">Diurnal</span></button>
                </div>
            </div>
        </div>
        `;
    }
}

if (!customElements.get('sacsi-vector-panel')) {
    customElements.define('sacsi-vector-panel', SacsiVectorPanel);
}