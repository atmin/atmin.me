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
        texUv = clamp(texUv, 0.0, 1.0);

        // Debug: Output texture coordinates as colors
        //gl_FragColor = vec4(texUv, 0.0, 1.0);

        // Debug: Sample the texture at the current UV coordinates
        // gl_FragColor = texture2D(uTexture, vUv);
    
        gl_FragColor = texture2D(uTexture, texUv);
    }
`;

const DAMPING = 0.985;
const ZOOM_DAMPING = 0.6;

export default class Pano extends HTMLElement {
    // System
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

    // Player state
    private aspectRatio;

    private _yaw = 0;
    get yaw(): number {
        return this._yaw;
    }
    set yaw(value) {
        this._yaw = value;
        this.setAttribute('yaw', value.toString());
    }

    private _pitch = 0;
    get pitch(): number {
        return this._pitch;
    }
    set pitch(value) {
        const clamped = Math.max(-89, Math.min(89, value));
        this._pitch = clamped;
        this.setAttribute('pitch', clamped.toString());
    }

    private _zoom = 2;
    get zoom(): number {
        return this._zoom;
    }
    get zoomFactor(): number {
        return 1.0 / this.zoom;
    }
    set zoom(value) {
        const clamped = Math.max(0.6, Math.min(10, value));
        this._zoom = clamped;
        this.setAttribute('zoom', clamped.toString());
    }

    private _yawVelocity = 0;
    get yawVelocity(): number {
        return this._yawVelocity;
    }
    set yawVelocity(value) {
        this._yawVelocity = Math.abs(value) < 0.001 ? 0 : value;
    }

    private _pitchVelocity = 0;
    get pitchVelocity(): number {
        return this._pitchVelocity;
    }
    set pitchVelocity(value) {
        this._pitchVelocity = Math.abs(value) < 0.001 ? 0 : value;
    }

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

    private isAnimating = false;
    private afterAnimationCallback: (() => void) | null = null;

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
        this.program = createProgram(
            this.gl,
            vertexShaderSource,
            fragmentShaderSource
        );
        this.gl.useProgram(this.program);

        const { gl, program, canvas } = this;

        this.texture = gl.createTexture();

        this.uTexture = gl.getUniformLocation(program, 'uTexture')!;
        this.uYaw = gl.getUniformLocation(program, 'uYaw')!;
        this.uPitch = gl.getUniformLocation(program, 'uPitch')!;
        this.uZoom = gl.getUniformLocation(program, 'uZoom')!;
        this.uAspectRatio = gl.getUniformLocation(program, 'uAspectRatio')!;

        const quadPositions = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        const quadUVs = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
        const indices = new Uint16Array([0, 1, 2, 2, 1, 3]);

        this.posBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf);
        gl.bufferData(gl.ARRAY_BUFFER, quadPositions, gl.STATIC_DRAW);

        this.uvBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf);
        gl.bufferData(gl.ARRAY_BUFFER, quadUVs, gl.STATIC_DRAW);

        this.idxBuf = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        this.positionLoc = gl.getAttribLocation(program, 'position');
        this.uvLoc = gl.getAttribLocation(program, 'uv');

        // MOUSE
        canvas.addEventListener('mousedown', (e) => {
            canvas.focus();
            this.startInteraction(e.clientX, e.clientY);
        });

        canvas.addEventListener('mousemove', (e) => {
            if (!this.isDragging) {
                return;
            }
            this.moveInteraction(e.clientX, e.clientY);
        });

        canvas.addEventListener('mouseup', () => this.endInteraction());
        canvas.addEventListener('mouseleave', () => this.endInteraction());

        canvas.addEventListener('wheel', (e) => {
            this.zoomVelocity -= e.deltaY * 0.0005;
            e.preventDefault();
        });

        // TOUCH
        let lastTouchDist = 0;

        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                const { clientX, clientY } = e.touches[0];
                this.startInteraction(clientX, clientY);
            } else if (e.touches.length === 2) {
                lastTouchDist = getTouchDist(e);
                this.isDragging = false;
                this.interactionHistory = [];
            }
        });

        canvas.addEventListener('touchmove', (e) => {
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

        canvas.addEventListener('touchend', () => {
            this.endInteraction();
        });

        // KEYBOARD
        window.addEventListener('keydown', (e) => {
            this.keys[e.key.toLowerCase()] = true;
        });
        window.addEventListener('keyup', (e) => {
            this.keys[e.key.toLowerCase()] = false;
        });

        window.addEventListener('resize', () => this.resize());
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (oldValue === newValue) return;

        if (name === 'src') {
            this.initPlayer(newValue);
        }
        if (name === 'yaw') {
            this._yaw = parseFloat(newValue) || 0;
        }
        if (name === 'pitch') {
            this._pitch = parseFloat(newValue) || 0;
        }
        if (name === 'zoom') {
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

        // TODO implement defer texture swapping *after* any running animation
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
                this.isAnimating = true;
                this._yaw = startYaw + (targetYaw - startYaw) * eased;
                this._pitch = startPitch + (targetPitch - startPitch) * eased;
                this._zoom = startZoom + (targetZoom - startZoom) * eased;

                // Request next frame
                requestAnimationFrame(animate);
            } else {
                this.isAnimating = false;
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
        console.log('[pan-oh] src=', sources);
        if (sources.length === 0) return;

        this.renderLoop();

        const { gl } = this;
        const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
        console.log('[pan-oh] WebGL max texture size:', maxTextureSize);
        console.log('[pan-oh] WebGL renderer:', gl.getParameter(gl.RENDERER));

        sources.reduce(
            (chain, src) =>
                chain.then(() =>
                    loadImage(src).then((image) => {
                        if (
                            image.width <= maxTextureSize &&
                            image.height <= maxTextureSize
                        ) {
                            this.afterAnimationCallback = () => {
                                bindTexture(this.gl, this.texture, image);
                                console.log('[pan-oh] dispatch textureLoaded');
                                this.dispatchEvent(
                                    new CustomEvent<{
                                        width: number;
                                        height: number;
                                    }>('textureLoaded', {
                                        detail: {
                                            width: image.width,
                                            height: image.height,
                                        },
                                    })
                                );
                            };
                            this.forceRender();
                        } else {
                            console.warn(
                                '[pan-oh] image dimension exceeds gl.MAX_TEXTURE_SIZE'
                            );
                        }
                    })
                ),
            Promise.resolve()
        );
    }

    private resize() {
        const { canvas, gl } = this;

        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        this.aspectRatio = canvas.height / canvas.width;
        gl.viewport(0, 0, canvas.width, canvas.height);
    }

    private startInteraction(x: number, y: number) {
        this.isDragging = true;
        this.lastX = x;
        this.lastY = y;
        this.yawVelocity = 0;
        this.pitchVelocity = 0;
        this.interactionHistory = [{ x, y, time: performance.now() }];
    }

    private moveInteraction(x: number, y: number) {
        const baseSensitivity = 0.3;
        const dx = x - this.lastX;
        const dy = y - this.lastY;

        this.yaw -= dx * baseSensitivity * this.zoomFactor;
        this.pitch += dy * baseSensitivity * this.zoomFactor;

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
                // Apply zoom-dependent sensitivity to inertia
                this.yawVelocity = -vx * 0.002 * this.zoomFactor;
                this.pitchVelocity = vy * 0.002 * this.zoomFactor;
            }
        }
        this.interactionHistory = [];
    }

    private updateState() {
        this.yaw += this.yawVelocity;
        this.yawVelocity *= DAMPING;

        this.pitch += this.pitchVelocity;
        this.pitchVelocity *= DAMPING;

        this.zoom += this.zoomVelocity;
        this.zoomVelocity *= ZOOM_DAMPING;
        this.zoomVelocity =
            Math.abs(this.zoomVelocity) < 0.05 ? 0 : this.zoomVelocity;

        const baseKeyStep = 0.1;
        const keyStep = baseKeyStep * this.zoomFactor;
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

        this.yawVelocity += this.yawAccel;
        this.pitchVelocity += this.pitchAccel;
        this.zoomVelocity += this.zoomAccel;
    }

    private renderLoop() {
        requestAnimationFrame(() => this.render());
    }

    private forceRender() {
        this.lastYaw = this.yaw - 0.001;
    }

    private render() {
        if (!this.isAnimating && this.afterAnimationCallback) {
            this.afterAnimationCallback();
            this.afterAnimationCallback = null;
        }
        this.updateState();

        const {
            gl,
            program,
            posBuf,
            positionLoc,
            uvBuf,
            uvLoc,
            idxBuf,
            canvas: { width, height },

            texture,
            yaw,
            pitch,
            zoom,
            aspectRatio,

            uTexture,
            uYaw,
            uPitch,
            uZoom,
            uAspectRatio,

            lastYaw,
            lastPitch,
            lastZoom,
            lastAspectRatio,
        } = this;

        const isRenderNeeded =
            yaw !== lastYaw ||
            pitch !== lastPitch ||
            zoom !== lastZoom ||
            aspectRatio !== lastAspectRatio;

        if (isRenderNeeded) {
            this.lastYaw = yaw;
            this.lastPitch = pitch;
            this.lastZoom = zoom;
            this.lastAspectRatio = aspectRatio;

            gl.viewport(0, 0, width, height);
            gl.clearColor(0.0, 0.5, 0.0, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT);

            gl.useProgram(program);

            gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
            gl.enableVertexAttribArray(positionLoc);
            gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
            gl.enableVertexAttribArray(uvLoc);
            gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);

            gl.uniform1f(uYaw, degToRad(yaw));
            gl.uniform1f(uPitch, degToRad(pitch));
            gl.uniform1f(uZoom, zoom);
            gl.uniform1f(uAspectRatio, aspectRatio);

            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.uniform1i(uTexture, 0);

            gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        }

        this.renderLoop();
    }
}

function degToRad(d: number) {
    return (d * Math.PI) / 180;
}

function getTouchDist(e: TouchEvent) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
    }
    return shader;
}

function createProgram(gl: WebGLRenderingContext, vs: string, fs: string) {
    const program = gl.createProgram();
    gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
    }
    return program;
}

function bindTexture(
    gl: WebGLRenderingContext,
    texture: WebGLTexture,
    image: HTMLImageElement
) {
    const isPowerOf2 = (value: number) => (value & (value - 1)) === 0;

    const textureSource: HTMLImageElement | HTMLCanvasElement =
        isPowerOf2(image.width) && isPowerOf2(image.height)
            ? image
            : resizeToPowerOf2(image);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        textureSource
    );

    // Now we can always use these settings
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const error = gl.getError();
    if (error !== gl.NO_ERROR) {
        console.error('[pan-oh] WebGL texture upload error:', error);
    } else {
        console.log('[pan-oh] Texture uploaded successfully');
    }
}

function resizeToPowerOf2(image: HTMLImageElement): HTMLCanvasElement {
    // Find the next power of 2 dimensions
    const width = nextPowerOf2(image.width);
    const height = nextPowerOf2(image.height);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Draw the image preserving aspect ratio and quality
    ctx.drawImage(image, 0, 0, width, height);

    return canvas;
}

function nextPowerOf2(n: number): number {
    return Math.pow(2, Math.ceil(Math.log2(n)));
}

function loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.src = url;
        image.crossOrigin = '';
        image.onload = () => {
            console.log('[pan-oh] loaded', image.width, '×', image.height, url);
            resolve(image);
        };
        image.onerror = () => {
            console.error(`[pan-oh] cannot load ${url}`);
            reject(url);
        };
    });
}

// Side effect
customElements.define('pan-oh', Pano);
