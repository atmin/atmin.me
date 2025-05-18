const glsl = (x: any): string => x; // for syntax-highlighting purposes

const vertexShaderSource = glsl`
    attribute vec2 position;
    attribute vec2 uv;
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position, 0.0, 1.0);
    }
`;

const fragmentShaderSource = glsl`
    precision mediump float;

    const float PI = 3.1415926535;
    const float TRANSITION_START = 1.6;
    const float TRANSITION_END = 2.4;

    uniform sampler2D uTexture;
    uniform float uYaw;
    uniform float uPitch;
    uniform float uZoom;
    uniform float uAspectRatio;
    varying vec2 vUv;

    void main() {
        // Apply aspect ratio correction to normalized device coordinates
        vec2 ndc = (vUv - 0.5) * 2.0;
        
        if (uAspectRatio > 1.0) {
            // Width is larger than height (landscape)
            ndc.x /= uAspectRatio;
        } else {
            // Height is larger than width (portrait)
            ndc.y *= uAspectRatio;
        }
        
        // Calculate blend factor (0 = stereographic, 1 = perspective)
        float blend = smoothstep(TRANSITION_START, TRANSITION_END, uZoom);
        
        vec3 dir;
        
        // Stereographic projection calculation
        float r2 = dot(ndc, ndc);
        float stereoScale = uZoom * (2.0 / (r2 + 1.0));
        vec3 stereoDir = vec3(ndc.x * stereoScale, ndc.y * stereoScale, stereoScale - 1.0);
        
        // Perspective projection calculation
        float fov = uZoom - 1.0;
        vec3 perspDir = vec3(ndc.x, ndc.y, fov);
        
        // Blend between the two directions
        dir = normalize(mix(stereoDir, perspDir, blend));

        float cy = cos(uYaw), sy = sin(uYaw);
        float cp = cos(uPitch), sp = sin(uPitch);

        mat3 rotY = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
        mat3 rotX = mat3(1.0, 0.0, 0.0, 0.0, cp, -sp, 0.0, sp, cp);

        dir = rotY * rotX * dir;

        float longitude = atan(dir.z, dir.x);
        float latitude = asin(clamp(dir.y, -1.0, 1.0));

        vec2 texUv = vec2(
            0.5 - longitude / (2.0 * PI),
            0.5 - latitude / PI
        );

        gl_FragColor = texture2D(uTexture, texUv);
    }
`;

const DAMPING = 0.98; // Controls inertia decay
const ZOOM_DAMPING = 0.5;
const EPSILON = 0.001;

export default class Pano extends HTMLElement {
    private canvas: HTMLCanvasElement;
    private gl: WebGLRenderingContext;
    private program: WebGLProgram;
    private texture: WebGLTexture;
    private positionLoc: number;
    private uvLoc: number;
    private posBuf: WebGLBuffer;
    private uvBuf: WebGLBuffer;
    private idxBuf: WebGLBuffer;
    private uTexture: WebGLUniformLocation;
    private uYaw: WebGLUniformLocation;
    private uPitch: WebGLUniformLocation;
    private uZoom: WebGLUniformLocation;
    private uAspectRatio: WebGLUniformLocation;

    // Camera controls
    private aspectRatio;
    private _yaw = 0;
    private _pitch = 0;
    private _zoom = 2;

    private yawVelocity = 0;
    private pitchVelocity = 0;
    private zoomVelocity = 0;
    private yawAccel = 0;
    private pitchAccel = 0;
    private zoomAccel = 0;
    private isDragging = false;
    private lastX = 0;
    private lastY = 0;

    // Be efficient
    private lastYaw = 0;
    private lastPitch = 0;
    private lastZoom = 0;
    private lastAspectRatio = 0;

    // Mouse/touch
    private interactionHistory: { x: number; y: number; time: number }[] = [];

    // Keymap
    private keys: Record<string, boolean> = {};

    static get observedAttributes() {
        return ['src', 'yaw', 'pitch', 'zoom'];
    }

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this.canvas = document.createElement('canvas');
        this.canvas.setAttribute('tabindex', '0');
        this.aspectRatio = this.canvas.height / this.canvas.width;
        this.gl = this.canvas.getContext('webgl')!;

        if (!this.gl) {
            alert('WebGL not supported');
        }

        // Allow external CSS styling via :host and ::slotted if needed
        const style = document.createElement('style');
        style.textContent = `
            :host {
                display: block;
                position: relative;
            }

            canvas {
                width: 100%;
                height: 100%;
                display: block;
                touch-action: none;
            }
        `;

        this.shadowRoot?.append(style, this.canvas);

        // GL
        this.program = this.createProgram(
            vertexShaderSource,
            fragmentShaderSource
        );
        this.gl.useProgram(this.program);

        this.texture = this.gl.createTexture();

        this.uTexture = this.gl.getUniformLocation(this.program, 'uTexture')!;
        this.uYaw = this.gl.getUniformLocation(this.program, 'uYaw')!;
        this.uPitch = this.gl.getUniformLocation(this.program, 'uPitch')!;
        this.uZoom = this.gl.getUniformLocation(this.program, 'uZoom')!;
        this.uAspectRatio = this.gl.getUniformLocation(
            this.program,
            'uAspectRatio'
        )!;

        const quadPositions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        const quadUVs = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
        const indices = new Uint16Array([0, 1, 2, 2, 1, 3]);

        this.posBuf = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.posBuf);
        this.gl.bufferData(
            this.gl.ARRAY_BUFFER,
            quadPositions,
            this.gl.STATIC_DRAW
        );

        this.uvBuf = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.uvBuf);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, quadUVs, this.gl.STATIC_DRAW);

        this.idxBuf = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
        this.gl.bufferData(
            this.gl.ELEMENT_ARRAY_BUFFER,
            indices,
            this.gl.STATIC_DRAW
        );

        this.positionLoc = this.gl.getAttribLocation(this.program, 'position');
        this.uvLoc = this.gl.getAttribLocation(this.program, 'uv');

        // MOUSE
        this.canvas.addEventListener('mousedown', (e) => {
            this.canvas.focus();
            this.startInteraction(e.clientX, e.clientY);
        });

        this.canvas.addEventListener('mousemove', (e) => {
            if (!this.isDragging) {
                return;
            }
            this.moveInteraction(e.clientX, e.clientY);
        });

        this.canvas.addEventListener('mouseup', () => this.endInteraction());
        this.canvas.addEventListener('mouseleave', () => this.endInteraction());

        this.canvas.addEventListener('wheel', (e) => {
            this.zoomVelocity -= e.deltaY * 0.0005;
            e.preventDefault();
        });

        // TOUCH
        let lastTouchDist = 0;

        this.canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                const { clientX, clientY } = e.touches[0];
                this.startInteraction(clientX, clientY);
            } else if (e.touches.length === 2) {
                lastTouchDist = getTouchDist(e);
                this.isDragging = false;
                this.interactionHistory = [];
            }
        });

        this.canvas.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1 && this.isDragging) {
                const { clientX, clientY } = e.touches[0];
                this.moveInteraction(clientX, clientY);
            } else if (e.touches.length === 2) {
                const dist = getTouchDist(e);
                const distDelta = dist - lastTouchDist;
                const scaledDelta =
                    Math.sign(distDelta) *
                    Math.pow(Math.abs(distDelta), 0.8) *
                    0.005;
                this.zoomVelocity += scaledDelta;
                lastTouchDist = dist;
            }
            e.preventDefault();
        });

        this.canvas.addEventListener('touchend', () => {
            this.endInteraction();
        });

        function getTouchDist(e: TouchEvent) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            return Math.sqrt(dx * dx + dy * dy);
        }

        // KEYBOARD
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        window.addEventListener('resize', () => this.resize());
    }

    get yaw(): number {
        return this._yaw;
    }
    set yaw(value) {
        this._yaw = value;
        this.setAttribute('yaw', value.toString());
    }

    get pitch(): number {
        return this._pitch;
    }
    set pitch(value) {
        const clamped = Math.max(-89, Math.min(89, value));
        this._pitch = clamped;
        this.setAttribute('pitch', clamped.toString());
    }

    get zoom(): number {
        return this._zoom;
    }
    set zoom(value) {
        const clamped = Math.max(0.6, Math.min(10, value));
        this._zoom = clamped;
        this.setAttribute('zoom', clamped.toString());
    }

    connectedCallback() {
        const src = this.getAttribute('src');
        if (src) {
            this.initPlayer(src);
        }
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (oldValue === newValue) return;

        if (name === 'src' && oldValue !== newValue) {
            this.initPlayer(newValue);
        } else if (name === 'yaw') {
            this._yaw = parseFloat(newValue) || 0;
        } else if (name === 'pitch') {
            this._pitch = parseFloat(newValue) || 0;
        } else if (name === 'zoom') {
            this._zoom = parseFloat(newValue) || 2;
        }
    }

    animateTo(
        targetYaw: number,
        targetPitch: number,
        targetZoom: number,
        duration = 1000
    ) {
        const startYaw = this.yaw;
        const startPitch = this.pitch;
        const startZoom = this.zoom;
        const startTime = performance.now();

        const animate = (currentTime: number) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);

            // Use easeInOutCubic for smooth animation
            const eased =
                progress < 0.5
                    ? 4 * progress * progress * progress
                    : 1 - Math.pow(-2 * progress + 2, 3) / 2;

            // Calculate current values
            if (progress < 1) {
                this._yaw = startYaw + (targetYaw - startYaw) * eased;
                this._pitch = startPitch + (targetPitch - startPitch) * eased;
                this._zoom = startZoom + (targetZoom - startZoom) * eased;

                // Request next frame
                requestAnimationFrame(animate);
            } else {
                // Ensure we end at exact target values
                this._yaw = targetYaw;
                this._pitch = targetPitch;
                this._zoom = targetZoom;
            }
        };

        requestAnimationFrame(animate);
    }

    initPlayer(srcString: string) {
        this.resize();

        const sources = srcString.trim().split(/\s+/);
        if (sources.length === 0) return;

        // Start loading the first (lowest) resolution
        this.loadTextureFromUrl(sources[0], () => {
            // Start rendering once the first texture is loaded
            requestAnimationFrame(() => this.render());

            this.dispatchEvent(new CustomEvent('textureLoaded'));

            // Then load higher resolutions in sequence if there are any
            if (sources.length > 1) {
                this.loadHigherResolutions(sources.slice(1));
            }
        });
    }

    private loadHigherResolutions(sources: string[]) {
        if (sources.length === 0) return;

        // Load the next resolution in the background
        this.loadTextureFromUrl(sources[0], () => {
            // Continue with remaining sources
            this.loadHigherResolutions(sources.slice(1));
        });
    }

    private loadTextureFromUrl(url: string, callback: () => void) {
        const image = new Image();
        image.src = url;
        image.crossOrigin = '';

        image.onload = () => {
            const { gl } = this;

            // Use the existing texture object
            gl.bindTexture(gl.TEXTURE_2D, this.texture);
            gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                gl.RGB,
                gl.RGB,
                gl.UNSIGNED_BYTE,
                image
            );
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(
                gl.TEXTURE_2D,
                gl.TEXTURE_WRAP_T,
                gl.CLAMP_TO_EDGE
            );
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

            const error = gl.getError();
            if (error !== gl.NO_ERROR) {
                console.error('WebGL texture upload error:', error);
            }

            // Force a render when texture updates, even if idle
            this.lastYaw = this.yaw - 0.001;

            // Execute callback after texture is loaded
            callback();
        };

        image.onerror = () => {
            console.error(`Failed to load image: ${url}`);
        };
    }

    private resize() {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
        this.aspectRatio = this.canvas.height / this.canvas.width;
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    private createShader(type: number, source: string) {
        const shader = this.gl.createShader(type)!;
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error(this.gl.getShaderInfoLog(shader));
        }
        return shader;
    }

    private createProgram(vs: string, fs: string) {
        const program = this.gl.createProgram();
        this.gl.attachShader(
            program,
            this.createShader(this.gl.VERTEX_SHADER, vs)
        );
        this.gl.attachShader(
            program,
            this.createShader(this.gl.FRAGMENT_SHADER, fs)
        );
        this.gl.linkProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error(this.gl.getProgramInfoLog(program));
        }
        return program;
    }

    private startInteraction(x: number, y: number) {
        this.isDragging = true;
        this.lastX = x;
        this.lastY = y;
        this.yawVelocity = 0;
        this.pitchVelocity = 0;
        this.interactionHistory = [{ x, y, time: performance.now() }];
    }

    private getZoomFactor(): number {
        // At zoom=1, factor=1. At higher zoom levels, the factor decreases
        return 1.0 / this.zoom;
    }

    private moveInteraction(x: number, y: number) {
        const dx = x - this.lastX;
        const dy = y - this.lastY;

        // Apply zoom-dependent sensitivity
        const zoomFactor = this.getZoomFactor();
        const baseSensitivity = 0.3;

        this.yaw -= dx * baseSensitivity * zoomFactor;
        this.pitch += dy * baseSensitivity * zoomFactor;

        this.pitch = Math.max(-89, Math.min(89, this.pitch));
        this.lastX = x;
        this.lastY = y;

        this.interactionHistory.push({ x, y, time: performance.now() });
        if (this.interactionHistory.length > 5) {
            this.interactionHistory.shift();
        }
    }

    private endInteraction() {
        this.isDragging = false;

        if (this.interactionHistory.length >= 2) {
            const first = this.interactionHistory[0];
            const last =
                this.interactionHistory[this.interactionHistory.length - 1];
            const dt = (last.time - first.time) / 1000;
            const dx = last.x - first.x;
            const dy = last.y - first.y;

            const vx = dx / dt;
            const vy = dy / dt;
            const speed = Math.sqrt(vx * vx + vy * vy);

            if (speed > 500) {
                // Apply zoom-dependent sensitivity to inertia too
                const zoomFactor = this.getZoomFactor();
                this.yawVelocity = -vx * 0.002 * zoomFactor;
                this.pitchVelocity = vy * 0.002 * zoomFactor;
            }
        }
        this.interactionHistory = [];
    }

    private render() {
        this.yaw += this.yawVelocity;
        this.pitch += this.pitchVelocity;

        this.pitch = Math.max(-89, Math.min(89, this.pitch));

        // Apply damping
        this.yawVelocity *= DAMPING;
        this.pitchVelocity *= DAMPING;

        if (Math.abs(this.yawVelocity) < EPSILON) {
            this.yawVelocity = 0;
        }
        if (Math.abs(this.pitchVelocity) < EPSILON) {
            this.pitchVelocity = 0;
        }

        this.zoom += this.zoomVelocity;
        this.zoomVelocity *= ZOOM_DAMPING;
        if (Math.abs(this.zoomVelocity) < 0.05) {
            this.zoomVelocity = 0;
        }

        // Get zoom-adjusted sensitivity for keyboard controls
        const zoomFactor = this.getZoomFactor();
        const baseKeyStep = 0.1;
        const keyStep = baseKeyStep * zoomFactor;
        const zoomStep = 0.01;

        if (this.keys['arrowleft'] || this.keys['a']) {
            this.yawAccel = -keyStep;
        } else if (this.keys['arrowright'] || this.keys['d']) {
            this.yawAccel = keyStep;
        } else this.yawAccel = 0;

        if (this.keys['arrowup'] || this.keys['w']) {
            this.pitchAccel = keyStep;
        } else if (this.keys['arrowdown'] || this.keys['s']) {
            this.pitchAccel = -keyStep;
        } else {
            this.pitchAccel = 0;
        }

        if (this.keys['='] || this.keys['+']) {
            this.zoomAccel = zoomStep;
        } else if (this.keys['-'] || this.keys['_']) {
            this.zoomAccel = -zoomStep;
        } else {
            this.zoomAccel = 0;
        }

        // Apply acceleration to velocity
        this.yawVelocity += this.yawAccel;
        this.pitchVelocity += this.pitchAccel;
        this.zoomVelocity += this.zoomAccel;

        if (
            this.yaw !== this.lastYaw ||
            this.pitch !== this.lastPitch ||
            this.zoom !== this.lastZoom ||
            this.aspectRatio !== this.lastAspectRatio
        ) {
            this.lastYaw = this.yaw;
            this.lastPitch = this.pitch;
            this.lastZoom = this.zoom;
            this.lastAspectRatio = this.aspectRatio;

            this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
            this.gl.clear(this.gl.COLOR_BUFFER_BIT);

            this.gl.useProgram(this.program);

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.posBuf);
            this.gl.enableVertexAttribArray(this.positionLoc);
            this.gl.vertexAttribPointer(
                this.positionLoc,
                2,
                this.gl.FLOAT,
                false,
                0,
                0
            );

            this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.uvBuf);
            this.gl.enableVertexAttribArray(this.uvLoc);
            this.gl.vertexAttribPointer(
                this.uvLoc,
                2,
                this.gl.FLOAT,
                false,
                0,
                0
            );

            this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);

            this.gl.uniform1f(this.uYaw, this.degToRad(this.yaw));
            this.gl.uniform1f(this.uPitch, this.degToRad(this.pitch));
            this.gl.uniform1f(this.uZoom, this.zoom);
            this.gl.uniform1f(this.uAspectRatio, this.aspectRatio);

            this.gl.activeTexture(this.gl.TEXTURE0);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.texture);
            this.gl.uniform1i(this.uTexture, 0);

            this.gl.drawElements(
                this.gl.TRIANGLES,
                6,
                this.gl.UNSIGNED_SHORT,
                0
            );
        }

        requestAnimationFrame(() => this.render());
    }

    // Math utilities
    private degToRad(d: number) {
        return (d * Math.PI) / 180;
    }
}

customElements.define('pan-oh', Pano);
