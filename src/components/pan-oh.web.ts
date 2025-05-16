const vsSource = `
    attribute vec3 position;
    attribute vec2 uv;
    varying vec2 vUv;
    uniform mat4 uProjection;
    uniform mat4 uView;

    void main() {
        vUv = uv;
        gl_Position = uProjection * uView * vec4(position, 1.0);
    }
`;

const fsSource = `
    precision mediump float;
    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform int uMode; // 0 = normal, 1 = little planet

    const float PI = 3.1415926;
    const float PI2 = 6.2831852;

    vec2 stereographicProjection(vec2 uv) {
        vec2 xy = (uv * 2.0 - 1.0); // Convert from [0,1] to [-1,1]
        float r2 = dot(xy, xy);

        if (r2 > 1.0) discard;

        // Inverse stereographic projection to 3D direction
        vec3 dir = normalize(vec3(
            2.0 * xy.x,
            2.0 * xy.y,
            1.0 - r2
        ));

        // Apply rotation: +90° pitch down (align center of disc to nadir)
        vec3 rotatedDir = vec3(
            dir.x,
            dir.z,
            -dir.y
        );

        float lon = atan(rotatedDir.x, rotatedDir.z);
        float lat = asin(clamp(rotatedDir.y, -1.0, 1.0));

        // Map to equirectangular texture space
        vec2 texUV;
        texUV.x = mod(lon / PI2 + 0.5, 1.0);
        texUV.y = 0.5 - lat / PI;

        return texUV;
    }

    void main() {
        vec2 uv = vUv;

        if (uMode == 1) {
            uv = stereographicProjection(vUv);
        }

        gl_FragColor = texture2D(uTexture, vec2(uv.s, 1.0 - uv.t));
    }
`;

const DAMPING = 0.95; // Controls inertia decay
const ZOOM_DAMPING = 0.5;

type SphereGeometry = {
    positions: Float32Array<ArrayBuffer>;
    uvs: Float32Array<ArrayBuffer>;
    indices: Uint16Array<ArrayBuffer>;
};

export default class Pano extends HTMLElement {
    private canvas: HTMLCanvasElement;
    private gl: WebGLRenderingContext;
    private sphere: SphereGeometry;
    private uProjectionLoc: WebGLUniformLocation;
    private uViewLoc: WebGLUniformLocation;
    private uModeLoc: WebGLUniformLocation;

    // Camera controls
    private yaw = 0;
    private pitch = 0;
    private fov = 75;
    private yawVelocity = 0;
    private pitchVelocity = 0;
    private zoomVelocity = 0;
    private yawAccel = 0;
    private pitchAccel = 0;
    private zoomAccel = 0;
    private isDragging = false;
    private lastX = 0;
    private lastY = 0;

    // Mouse/touch
    private interactionHistory: { x: number; y: number; time: number }[] = [];
    private lastDist = 0;

    // Keymap
    private keys: Record<string, boolean> = {};

    static get observedAttributes() {
        return ['src'];
    }

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });

        this.canvas = document.createElement('canvas');
        this.canvas.setAttribute('tabindex', '0');
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
        const program = this.createProgram(vsSource, fsSource);
        this.gl.useProgram(program);

        this.sphere = this.createSphereGeometry(64, 128);

        const positionLoc = this.gl.getAttribLocation(program, 'position');
        this.uProjectionLoc = this.gl.getUniformLocation(
            program,
            'uProjection'
        )!;
        this.uViewLoc = this.gl.getUniformLocation(program, 'uView')!;
        this.uModeLoc = this.gl.getUniformLocation(program, 'uMode')!;

        const positionBuffer = this.createBuffer(
            this.sphere.positions,
            this.gl.ARRAY_BUFFER,
            this.gl.STATIC_DRAW
        );
        this.gl.enableVertexAttribArray(positionLoc);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, positionBuffer);
        this.gl.vertexAttribPointer(positionLoc, 3, this.gl.FLOAT, false, 0, 0);

        const uvBuffer = this.createBuffer(
            this.sphere.uvs,
            this.gl.ARRAY_BUFFER,
            this.gl.STATIC_DRAW
        );
        const uvLoc = this.gl.getAttribLocation(program, 'uv');
        this.gl.enableVertexAttribArray(uvLoc);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, uvBuffer);
        this.gl.vertexAttribPointer(uvLoc, 2, this.gl.FLOAT, false, 0, 0);

        this.createBuffer(
            this.sphere.indices,
            this.gl.ELEMENT_ARRAY_BUFFER,
            this.gl.STATIC_DRAW
        );

        // Disable culling so we render inside of the sphere
        this.gl.disable(this.gl.CULL_FACE);
    }

    connectedCallback() {
        const src = this.getAttribute('src');
        if (src) {
            this.initPlayer(src);
        }
    }

    attributeChangedCallback(name: string, oldValue: string, newValue: string) {
        if (name === 'src' && oldValue !== newValue) {
            this.initPlayer(newValue);
        }
    }

    initPlayer(src: string) {
        window.addEventListener('resize', this.onResize.bind(this));
        this.onResize();

        // Texture
        const texture = this.gl.createTexture();
        const image = new Image();
        image.crossOrigin = '';
        image.onload = () => {
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
            this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);
            this.gl.texImage2D(
                this.gl.TEXTURE_2D,
                0,
                this.gl.RGB,
                this.gl.RGB,
                this.gl.UNSIGNED_BYTE,
                image
            );
            this.gl.generateMipmap(this.gl.TEXTURE_2D);
            requestAnimationFrame(this.render.bind(this));
        };
        image.src = src;

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
            this.zoomVelocity += e.deltaY * 0.1;
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
                this.zoomVelocity -= (dist - lastTouchDist) * 0.2;
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
    }

    private onResize() {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
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

    private createBuffer(
        data: AllowSharedBufferSource | null,
        target: number,
        usage: number
    ) {
        const buffer = this.gl.createBuffer();
        this.gl.bindBuffer(target, buffer);
        this.gl.bufferData(target, data, usage);
        return buffer;
    }

    private createSphereGeometry(
        latBands: number,
        lonBands: number
    ): SphereGeometry {
        const positions = [];
        const uvs = [];
        const indices = [];

        for (let lat = 0; lat <= latBands; ++lat) {
            const theta = (lat * Math.PI) / latBands;
            const sinTheta = Math.sin(theta);
            const cosTheta = Math.cos(theta);

            for (let lon = 0; lon <= lonBands; ++lon) {
                const phi = (lon * 2 * Math.PI) / lonBands;
                const sinPhi = Math.sin(phi);
                const cosPhi = Math.cos(phi);

                const x = cosPhi * sinTheta;
                const y = -cosTheta;
                const z = sinPhi * sinTheta;
                const u = lon / lonBands;
                const v = lat / latBands;

                positions.push(x, y, z);
                uvs.push(u, v);
            }
        }

        for (let lat = 0; lat < latBands; ++lat) {
            for (let lon = 0; lon < lonBands; ++lon) {
                const first = lat * (lonBands + 1) + lon;
                const second = first + lonBands + 1;
                indices.push(first, second, first + 1);
                indices.push(second, second + 1, first + 1);
            }
        }

        return {
            positions: new Float32Array(positions),
            uvs: new Float32Array(uvs),
            indices: new Uint16Array(indices),
        };
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
        const dx = x - this.lastX;
        const dy = y - this.lastY;

        this.yaw += dx * 0.3;
        this.pitch += dy * 0.3;

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
                this.yawVelocity = vx * 0.002;
                this.pitchVelocity = vy * 0.002;
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

        if (Math.abs(this.yawVelocity) < 0.001) {
            this.yawVelocity = 0;
        }
        if (Math.abs(this.pitchVelocity) < 0.001) {
            this.pitchVelocity = 0;
        }

        this.fov += this.zoomVelocity;
        this.zoomVelocity *= ZOOM_DAMPING;
        if (Math.abs(this.zoomVelocity) < 0.05) {
            this.zoomVelocity = 0;
        }
        this.fov = Math.max(30, Math.min(100, this.fov));

        const keyStep = 0.1; // how fast it accelerates
        const zoomStep = 0.1;

        if (this.keys['arrowleft'] || this.keys['a']) {
            this.yawAccel = keyStep;
        } else if (this.keys['arrowright'] || this.keys['d']) {
            this.yawAccel = -keyStep;
        } else this.yawAccel = 0;

        if (this.keys['arrowup'] || this.keys['w']) {
            this.pitchAccel = keyStep;
        } else if (this.keys['arrowdown'] || this.keys['s']) {
            this.pitchAccel = -keyStep;
        } else {
            this.pitchAccel = 0;
        }

        if (this.keys['='] || this.keys['+']) {
            this.zoomAccel = -zoomStep;
        } else if (this.keys['-'] || this.keys['_']) {
            this.zoomAccel = zoomStep;
        } else {
            this.zoomAccel = 0;
        }

        // Apply acceleration to velocity
        this.yawVelocity += this.yawAccel;
        this.pitchVelocity += this.pitchAccel;
        this.zoomVelocity += this.zoomAccel;

        this.onResize();

        this.gl.clearColor(0, 0, 0, 1);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);

        const aspect = this.canvas.width / this.canvas.height;
        const projection = this.getProjectionMatrix(this.fov, aspect, 0.1, 100);
        const view = this.getViewMatrix(this.yaw, this.pitch);

        this.gl.uniformMatrix4fv(this.uViewLoc, false, view);
        this.gl.uniformMatrix4fv(this.uProjectionLoc, false, projection);
        const currentMode = 0; // 0 - perspective, 1 - stereographic
        this.gl.uniform1i(this.uModeLoc, currentMode);

        this.gl.drawElements(
            this.gl.TRIANGLES,
            this.sphere.indices.length,
            this.gl.UNSIGNED_SHORT,
            0
        );
        requestAnimationFrame(this.render.bind(this));
    }

    // Math utilities
    private degToRad(d: number) {
        return (d * Math.PI) / 180;
    }

    private getProjectionMatrix(
        fov: number,
        aspect: number,
        near: number,
        far: number
    ) {
        const f = 1.0 / Math.tan(this.degToRad(fov) / 2);
        // prettier-ignore
        return new Float32Array([
                f / aspect, 0, 0, 0,
                0, f, 0, 0,
                0, 0, (near + far) / (near - far), -1,
                0, 0, (2 * near * far) / (near - far), 0,
            ]);
    }

    private getViewMatrix(yawDeg: number, pitchDeg: number) {
        const yaw = this.degToRad(yawDeg);
        const pitch = this.degToRad(pitchDeg);

        // Calculate direction vector
        const x = Math.cos(pitch) * Math.sin(yaw);
        const y = Math.sin(pitch);
        const z = Math.cos(pitch) * Math.cos(yaw);

        const eye = [0, 0, 0];
        const center = [x, y, z];
        const up = [0, 1, 0];

        return this.lookAt(eye, center, up);
    }

    private lookAt(eye: number[], center: number[], up: number[]) {
        const f = this.normalizeVector([
            center[0] - eye[0],
            center[1] - eye[1],
            center[2] - eye[2],
        ]);
        const s = this.normalizeVector(this.cross(f, up));
        const u = this.cross(s, f);

        // prettier-ignore
        return new Float32Array([
                s[0], u[0], -f[0], 0,
                s[1], u[1], -f[1], 0,
                s[2], u[2], -f[2], 0,
                0, 0, 0, 1,
            ]);
    }

    private normalizeVector(v: number[]) {
        const len = Math.hypot(v[0], v[1], v[2]);
        return [v[0] / len, v[1] / len, v[2] / len];
    }

    private cross(a: number[], b: number[]) {
        return [
            a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0],
        ];
    }
}

customElements.define('pan-oh', Pano);
