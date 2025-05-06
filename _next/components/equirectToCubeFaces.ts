// Converts equirectangular projection to cube faces, but is slow to do on image load
// Based on https://github.com/thomcc/equirect-to-cubemap-faces

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

// These are approximations that assume gamma is 2.0. Not ideal, but close enough.
function srgbToLinear(v: number) {
  var component = +v * (1.0 / 255.0);
  return component * component;
}

function linearToSRGB(v: number) {
  return (Math.sqrt(v) * 255.0) | 0;
}

function nearestPowerOfTwo(n: number) {
  return 1 << Math.round(Math.log(n) / Math.log(2));
}

const DEFAULT_OPTIONS = {
  flipTheta: false,
  interpolation: "bilinear",
};

function transformSingleFace(
  inPixels: { width: number; height: number; data: any },
  faceIdx: number,
  facePixels: { width: number; data: any; height: number },
  opts: { flipTheta: any; interpolation: any }
) {
  if (!opts) {
    opts = DEFAULT_OPTIONS;
  }
  const thetaFlip = opts.flipTheta ? -1 : 1;
  const edge = facePixels.width | 0;

  const inWidth = inPixels.width | 0;
  const inHeight = inPixels.height | 0;
  const inData = inPixels.data;

  const smoothNearest = opts.interpolation === "nearest";

  const faceData = facePixels.data;
  const faceWidth = facePixels.width | 0;
  const faceHeight = facePixels.height | 0;
  const face = faceIdx | 0;

  const iFaceWidth2 = 2.0 / faceWidth;
  const iFaceHeight2 = 2.0 / faceHeight;

  for (let j = 0; j < faceHeight; ++j) {
    for (let i = 0; i < faceWidth; ++i) {
      const a = iFaceWidth2 * i;
      const b = iFaceHeight2 * j;
      const outPos = (i + j * edge) << 2;

      let x = 0.0;
      let y = 0.0;
      let z = 0.0;

      // @@NOTE: Tried using explicit matrices for this and didn't see any
      // speedup over the (IMO more understandable) switch. (Probably because these
      // branches should be correctly predicted almost every time).
      switch (face) {
        case 0:
          x = 1.0 - a;
          y = 1.0;
          z = 1.0 - b;
          break; // right  (+x)
        case 1:
          x = a - 1.0;
          y = -1.0;
          z = 1.0 - b;
          break; // left   (-x)
        case 2:
          x = b - 1.0;
          y = a - 1.0;
          z = 1.0;
          break; // top    (+y)
        case 3:
          x = 1.0 - b;
          y = a - 1.0;
          z = -1.0;
          break; // bottom (-y)
        case 4:
          x = 1.0;
          y = a - 1.0;
          z = 1.0 - b;
          break; // front  (+z)
        case 5:
          x = -1.0;
          y = 1.0 - a;
          z = 1.0 - b;
          break; // back   (-z)
      }

      const theta = thetaFlip * Math.atan2(y, x);
      const rad = Math.sqrt(x * x + y * y);
      const phi = Math.atan2(z, rad);

      const uf = (2.0 * (inWidth / 4) * (theta + Math.PI)) / Math.PI;
      const vf = (2.0 * (inWidth / 4) * (Math.PI / 2 - phi)) / Math.PI;
      const ui = Math.floor(uf) | 0;
      const vi = Math.floor(vf) | 0;

      if (smoothNearest) {
        const inPos =
          ((ui % inWidth) + inWidth * clamp(vi, 0, inHeight - 1)) << 2;
        faceData[outPos + 0] = inData[inPos + 0] | 0;
        faceData[outPos + 1] = inData[inPos + 1] | 0;
        faceData[outPos + 2] = inData[inPos + 2] | 0;
        faceData[outPos + 3] = inData[inPos + 3] | 0;
      } else {
        // bilinear blend
        const u2 = ui + 1;
        const v2 = vi + 1;
        const mu = uf - ui;
        const nu = vf - vi;

        const pA = ((ui % inWidth) + inWidth * clamp(vi, 0, inHeight - 1)) << 2;
        const pB = ((u2 % inWidth) + inWidth * clamp(vi, 0, inHeight - 1)) << 2;
        const pC = ((ui % inWidth) + inWidth * clamp(v2, 0, inHeight - 1)) << 2;
        const pD = ((u2 % inWidth) + inWidth * clamp(v2, 0, inHeight - 1)) << 2;
        const aA = (inData[pA + 3] | 0) * (1.0 / 255.0);
        const aB = (inData[pB + 3] | 0) * (1.0 / 255.0);
        const aC = (inData[pC + 3] | 0) * (1.0 / 255.0);
        const aD = (inData[pD + 3] | 0) * (1.0 / 255.0);
        // Do the bilinear blend in linear space.
        const rA = srgbToLinear(inData[pA + 0] | 0) * aA;
        const gA = srgbToLinear(inData[pA + 1] | 0) * aA;
        const bA = srgbToLinear(inData[pA + 2] | 0) * aA;
        const rB = srgbToLinear(inData[pB + 0] | 0) * aB;
        const gB = srgbToLinear(inData[pB + 1] | 0) * aB;
        const bB = srgbToLinear(inData[pB + 2] | 0) * aB;
        const rC = srgbToLinear(inData[pC + 0] | 0) * aC;
        const gC = srgbToLinear(inData[pC + 1] | 0) * aC;
        const bC = srgbToLinear(inData[pC + 2] | 0) * aC;
        const rD = srgbToLinear(inData[pD + 0] | 0) * aD;
        const gD = srgbToLinear(inData[pD + 1] | 0) * aD;
        const bD = srgbToLinear(inData[pD + 2] | 0) * aD;

        const r =
          rA * (1.0 - mu) * (1.0 - nu) +
          rB * mu * (1.0 - nu) +
          rC * (1.0 - mu) * nu +
          rD * mu * nu;
        const g =
          gA * (1.0 - mu) * (1.0 - nu) +
          gB * mu * (1.0 - nu) +
          gC * (1.0 - mu) * nu +
          gD * mu * nu;
        const b =
          bA * (1.0 - mu) * (1.0 - nu) +
          bB * mu * (1.0 - nu) +
          bC * (1.0 - mu) * nu +
          bD * mu * nu;
        const a =
          aA * (1.0 - mu) * (1.0 - nu) +
          aB * mu * (1.0 - nu) +
          aC * (1.0 - mu) * nu +
          aD * mu * nu;
        const ia = 1.0 / a;
        faceData[outPos + 0] = linearToSRGB(r * ia) | 0;
        faceData[outPos + 1] = linearToSRGB(g * ia) | 0;
        faceData[outPos + 2] = linearToSRGB(b * ia) | 0;
        faceData[outPos + 3] = (a * 255.0) | 0;
      }
    }
  }
  return facePixels;
}

function transformToCubeFaces(
  inPixels: any,
  facePixArray: any[],
  options: { flipTheta: boolean; interpolation: string }
) {
  if (facePixArray.length !== 6) {
    throw new Error("facePixArray length must be 6!");
  }
  if (!options) {
    options = DEFAULT_OPTIONS;
  }
  for (var face = 0; face < 6; ++face) {
    transformSingleFace(inPixels, face, facePixArray[face], options);
  }
  return facePixArray;
}

function imageGetPixels(image: any) {
  if (image.data) {
    return image;
  }
  var canvas = image,
    ctx = null;
  if (canvas.tagName !== "CANVAS") {
    canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    ctx = canvas.getContext("2d");
    ctx.drawImage(
      image,
      0,
      0,
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height
    );
  } else {
    ctx = canvas.getContext("2d");
  }
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function equirectToCubemapFaces(
  image: { width: number },
  faceSize?: number,
  options?: any
): HTMLCanvasElement[] {
  var inPixels = imageGetPixels(image);

  if (!faceSize) {
    faceSize = nearestPowerOfTwo(image.width / 4) | 0;
  }

  if (typeof faceSize !== "number") {
    throw new Error("faceSize needed to be a number or missing");
  }

  var faces = [];
  for (var i = 0; i < 6; ++i) {
    var c = document.createElement("canvas");
    c.width = faceSize;
    c.height = faceSize;
    faces.push(c);
  }

  transformToCubeFaces(
    inPixels,
    faces.map(function (canv) {
      return canv.getContext("2d").createImageData(canv.width, canv.height);
    }),
    options
  ).forEach(function (imageData: any, i: string | number) {
    faces[i].getContext("2d").putImageData(imageData, 0, 0);
  });
  return faces;
}

equirectToCubemapFaces.transformSingleFace = transformSingleFace;
equirectToCubemapFaces.transformToCubeFaces = transformToCubeFaces;

export default equirectToCubemapFaces;
