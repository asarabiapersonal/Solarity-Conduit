// Soft, ambient-occlusion-style floor shadows ("contact shadows").
// An orthographic camera looks straight up from the floor and renders how close each object is to
// the floor. That image is blurred twice and laid on the floor: parts touching the floor leave a
// soft grey shadow and parts higher up fade out. There is no light direction, so it reads like the
// soft occlusion under things in an evenly lit warehouse rather than a hard sun shadow.
import * as THREE from 'three';
import { HorizontalBlurShader } from 'three/addons/shaders/HorizontalBlurShader.js';
import { VerticalBlurShader } from 'three/addons/shaders/VerticalBlurShader.js';

export const NO_CONTACT_SHADOW = 1; // layer for things that must not cast (floor, walls, the shadow itself)

export function createContactShadow(renderer, scene, {
  size = 280,      // inches covered around the work area
  res = 1024,      // render target resolution
  height = 70,     // objects higher than this above the floor cast nothing
  darkness = 1.6,  // strength right at the floor
  opacity = 0.55,  // overall: soft grey, never black
  spread = 1.8,    // how far the soft shadow reaches out from a part, in inches
  layer = 0,       // which layer casts into this shadow
} = {}) {
  const group = new THREE.Group();
  group.position.y = 0.04;
  scene.add(group);

  const rt = new THREE.WebGLRenderTarget(res, res); rt.texture.generateMipmaps = false;
  const rtBlur = new THREE.WebGLRenderTarget(res, res); rtBlur.texture.generateMipmaps = false;

  const planeGeo = new THREE.PlaneGeometry(size, size).rotateX(Math.PI / 2);
  const plane = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({ map: rt.texture, opacity, transparent: true, depthWrite: false }));
  plane.renderOrder = 1;
  plane.scale.y = -1;               // the camera looks up, so flip the image back
  plane.layers.set(NO_CONTACT_SHADOW);
  group.add(plane);

  const blurPlane = new THREE.Mesh(planeGeo);
  blurPlane.visible = false;
  blurPlane.layers.set(layer);     // the blur passes render it with this camera, so it must be on its layer
  group.add(blurPlane);

  const cam = new THREE.OrthographicCamera(-size / 2, size / 2, size / 2, -size / 2, 0, height);
  cam.rotation.x = Math.PI / 2;     // look up
  cam.layers.set(layer);            // only objects on this layer cast
  group.add(cam);

  // depth → shadow strength: close to the floor = dark, `height` above = nothing
  const depthMat = new THREE.MeshDepthMaterial();
  depthMat.userData.darkness = { value: darkness };
  depthMat.onBeforeCompile = (shader) => {
    shader.uniforms.darkness = depthMat.userData.darkness;
    shader.fragmentShader = /* glsl */`
      uniform float darkness;
      ${shader.fragmentShader.replace(
        'gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );',
        'gl_FragColor = vec4( vec3( 0.0 ), ( 1.0 - fragCoordZ ) * darkness );'
      )}`;
  };
  depthMat.depthTest = false; depthMat.depthWrite = false;
  depthMat.side = THREE.DoubleSide;

  const hBlur = new THREE.ShaderMaterial(HorizontalBlurShader); hBlur.depthTest = false;
  const vBlur = new THREE.ShaderMaterial(VerticalBlurShader); vBlur.depthTest = false;

  // The blur shaders sample ±4 steps of h (in texture units), so a spread of `inches` needs
  // h = inches / (4 · size).
  function blurPass(inches) {
    const amount = inches / (4 * size);
    blurPlane.visible = true;
    blurPlane.material = hBlur;
    hBlur.uniforms.tDiffuse.value = rt.texture;
    hBlur.uniforms.h.value = amount;
    renderer.setRenderTarget(rtBlur); renderer.render(blurPlane, cam);
    blurPlane.material = vBlur;
    vBlur.uniforms.tDiffuse.value = rtBlur.texture;
    vBlur.uniforms.v.value = amount;
    renderer.setRenderTarget(rt); renderer.render(blurPlane, cam);
    blurPlane.visible = false;
  }

  const hidden = [];
  return {
    group, rt, plane, cam,
    // center the shadow area on the work (x, z on the floor)
    follow(x, z) { group.position.x = x; group.position.z = z; },
    update() {
      const bg = scene.background; scene.background = null;
      // labels and helper lines would otherwise print squares into the shadow
      scene.traverseVisible(o => { if (o.isSprite || o.isLine) { hidden.push(o); o.visible = false; } });
      scene.overrideMaterial = depthMat;
      const clear = renderer.getClearAlpha();
      renderer.setClearAlpha(0);
      renderer.setRenderTarget(rt);
      renderer.clear();
      renderer.render(scene, cam);
      scene.overrideMaterial = null;
      blurPass(spread);
      blurPass(spread * 0.4);         // second, finer pass removes banding
      renderer.setRenderTarget(null);
      renderer.setClearAlpha(clear);
      for (const o of hidden) o.visible = true;
      hidden.length = 0;
      scene.background = bg;
    },
  };
}
