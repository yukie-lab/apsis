/**
 * The 3D scene: the Sun, the bodies, their orbits, the path of the flight and the spacecraft at the time of the view.
 *
 * Rules of the scene:
 * - All positions come from the engine (ephemeris and trajectory) at the time of the view. The scene has no motion
 *   of its own. The attitude of the spacecraft is the only example value (the antenna points to the Earth).
 * - All objects have their true size and their true distance. Marks, labels and lines have a constant size on the
 *   screen: a dot shows the position of a body that is too small to see, not its size.
 * - World axes: ECLIPJ2000 (+Z = ecliptic north), km. The origin of the scene is the object in focus, thus the
 *   numbers near the camera are small and the 32-bit numbers of the graphics card are sufficient.
 * - The path of the flight is drawn relative to the solar system barycenter. Near a body (camera inside some
 *   sphere-of-influence radii) the part of the path near that body is drawn relative to the body: the user sees
 *   the flyby hyperbola or the orbit. `info.pathFrames` says which frames the view uses.
 * - A line is made of straight segments. The segment that contains the spacecraft is drawn again at each frame
 *   with many points (states of the trajectory at times near the time of the view): the line goes through the
 *   spacecraft at all camera distances. The orbit line of a body that is not a point on the screen is sampled
 *   again at each frame for the same reason.
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { BODIES, BODY_LIST, AU, type Body } from '../../engine/bodies';
import { bodyAxes } from '../../engine/frames';
import type { SolarSystem } from '../../engine/system';
import type { Trajectory, TrajectoryEvent } from '../../engine/propagate';
import type { Vec3 } from '../../engine/vec';
import { createBody, createStarfield, loadManifest, EMPTY_MANIFEST, type BodyVisual, type TextureManifest, type Starfield, type ShadowCaster, type BodyQuality } from '../bodies';
import { buildSpacecraft, SPACECRAFT_KINDS, type SpacecraftModel, type SpacecraftKind } from '../spacecraft';
import { PathLine, MAX_SPANS } from './lines';
import { Markers } from './markers';
import { Labels } from './labels';
import { OrbitCamera } from './camera';
import { buildPath, sampleOrbit, segmentAt, spanWeight, toWorld, type PathData, type OrbitData } from './path';

export type Focus = { kind: 'body'; id: string } | { kind: 'craft' };

export interface SceneOptions {
  canvas: HTMLCanvasElement;
  labelLayer: HTMLElement;
  system: SolarSystem;
  quality: BodyQuality;
  /** Address of the public directory. */
  baseUrl: string;
  /** Time of the view, et. The scene reads it at each frame. */
  time: () => number;
  bodyName: (id: string) => string;
  /** The user selected a label. */
  onPick?: (target: Focus) => void;
  /** The user moved the camera (the automatic camera is then off). */
  onUserMove?: () => void;
  /** With an automatic time rate: the scene gives the rate (simulation seconds for each second) at each frame. */
  onRate?: (rate: number) => void;
  /** Text of the label of a closest approach of the flight (the body and the date). Empty text: no label. */
  eventName?: (e: TrajectoryEvent) => string;
  /** The user selected the label of an event. */
  onPickEvent?: (e: TrajectoryEvent) => void;
}

export interface SceneInfo {
  focus: Focus;
  cameraDistanceKm: number;
  /** Body with the largest apparent size as seen from the spacecraft (not the Sun). */
  near: { id: string; distanceKm: number; altitudeKm: number; speedKmS: number } | null;
  /** Bodies relative to which a part of the path is drawn now. Empty: the barycentric frame only. */
  pathFrames: string[];
  /** True if the 3D model of the spacecraft is in the view (true size). False: a mark shows its position. */
  craftModel: boolean;
  /** View of the automatic camera, or null if the user controls the camera. */
  director: DirectorMode | null;
}

/**
 * Views of the automatic camera. craft: the spacecraft with the nearest body behind it. system: the solar system
 * from above (cruise). body: the nearest body and the flight path around it, from a direction that shows the side
 * in sunlight, the night side and the spacecraft (the spacecraft is near the body and above its night side: the
 * view from the spacecraft would be dark).
 */
export type DirectorMode = 'craft' | 'system' | 'body';

/** Lighting of the spacecraft models (the values of their test page). */
const LIGHT = { sun: 3.2, fill: 0.22, environment: 0.32 };
const MAJOR = new Set(['SUN', 'MERCURY', 'VENUS', 'EARTH', 'MARS', 'JUPITER', 'SATURN', 'URANUS', 'NEPTUNE', 'PLUTO']);
const COLOR_PAST = '#ffc56e', COLOR_FUTURE = '#6f8fd0';
/** Apparent radius of a body as seen from the spacecraft at which the automatic camera goes to the spacecraft, rad. */
const DIRECTOR_IN = 0.0021, DIRECTOR_OUT = 0.0012;
/** The view of the body starts above this apparent radius of the body (rad) and stops below the second value. */
const DIRECTOR_CLOSE = 0.35, DIRECTOR_CLOSE_OUT = 0.24;
/**
 * The view of the body starts when the cosine of the angle at the body between the Sun and the spacecraft is below
 * the first value (the spacecraft is well above the night side) and stops above the second value.
 */
const NIGHT_IN = -0.4, NIGHT_OUT = -0.15;
/** Part of the view by which the automatic camera moves the spacecraft from the middle (the body is on the other side). */
const AIM_SHIFT = 0.42;
/** View of a body by the automatic camera: the part of the smaller side of the view that the body and the spacecraft fill. */
const BODY_FILL = 0.58;
/** That view: angle by which the camera turns from the side view to the Sun, rad. */
const SHADOW_TILT = 0.21;
/** Largest number of points of the part of the path that is drawn again near the spacecraft. */
const LOCAL_POINTS = 200;
/** Ratio of two time steps of that part that follow each other. */
const LOCAL_RATIO = 1.4;
const smooth = (a: number, b: number, x: number): number => { const u = Math.max(0, Math.min(1, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

interface Entry {
  id: string;
  body: Body;
  top: boolean;
  /** Position relative to the solar system barycenter, world axes, km. */
  pos: Vec3;
  valid: boolean;
  shown: boolean;
  rel: THREE.Vector3;
  /** Distance from the camera, km. */
  dcam: number;
  /** Apparent radius, CSS pixels. */
  px: number;
  visual: BodyVisual | null;
  idle: number;
  orbit: { line: PathLine; data: OrbitData | null } | null;
}

export class Scene3D {
  readonly info: SceneInfo = { focus: { kind: 'body', id: 'SUN' }, cameraDistanceKm: 0, near: null, pathFrames: [], craftModel: false, director: null };
  readonly camera: OrbitCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly cam = new THREE.PerspectiveCamera(40, 1, 1e-4, 1e12);
  private readonly sys: SolarSystem;
  private readonly entries: Entry[] = [];
  private readonly byId = new Map<string, Entry>();
  private readonly markers = new Markers();
  private readonly labels: Labels;
  private readonly sunLight = new THREE.DirectionalLight(0xffffff, LIGHT.sun);
  private manifest: TextureManifest = EMPTY_MANIFEST;
  private manifestReady = false;
  private stars: Starfield | null = null;
  private frameId = 0;
  private last = 0;
  private disposed = false;
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private readonly observer: ResizeObserver;

  private focus: Focus = { kind: 'body', id: 'SUN' };
  private transition: { from: Focus; zoomOut: boolean } | null = null;
  private readonly origin: Vec3 = [0, 0, 0];
  private director = false;
  /** The caller wants the automatic camera: it starts when the scene gets a flight. */
  private directorWish = false;
  private directorMode: DirectorMode = 'system';
  private directorBody = '';
  private autoAim = false;
  /**
   * Position of the focus on the screen: distance from the middle in half-sizes of the view (x to the right, y up).
   * The projection moves (as with a lens shift): the perspective does not change.
   * shiftBase: set by the user interface (a panel covers a part of the view). shiftAim: set by the automatic camera.
   */
  private readonly shift = new THREE.Vector2();
  private readonly shiftBase = new THREE.Vector2();
  private readonly shiftAim = new THREE.Vector2();
  private shiftJump = true;
  /** Slow turn of the view while the user does nothing, rad/s (0: off). */
  private spin = 0;
  private showLabels = true;
  private showOrbits = true;
  private showSmall = false;
  private lastEt = NaN;
  private still = 0;
  /**
   * Clock of the display effects that are not data (the motion of the clouds, the cells of the surface of the Sun,
   * the spin angle of a spinning spacecraft), s. It runs at the speed of the display while the time of the view
   * changes, and stops when the time stops: with the time stopped, nothing moves.
   */
  private effects = 0;

  private tr: Trajectory | null = null;
  private path: PathData | null = null;
  private helio: PathLine | null = null;
  /** The segment of the path that contains the spacecraft, with many points: barycentric path and path relative to a body. */
  private localSsb: PathLine | null = null;
  private localRel: PathLine | null = null;
  private readonly localPts = new Float64Array(3 * LOCAL_POINTS);
  private readonly localTimes = new Float64Array(LOCAL_POINTS);
  private spanLines: (PathLine | null)[] = [];
  private readonly spanFade: number[] = [];
  private watch = new Set<string>();
  private craftKind: SpacecraftKind = 'apsis';
  private craftName = '';
  private craft: SpacecraftModel | null = null;
  private readonly craftPos: Vec3 = [0, 0, 0];
  private readonly craftVel: Vec3 = [0, 0, 0];
  private rateNow = 0;
  /** Largest distance of the path from the solar system barycenter, km. */
  private pathRadius = 0;

  constructor(private readonly opt: SceneOptions) {
    this.sys = opt.system;
    this.renderer = new THREE.WebGLRenderer({ canvas: opt.canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene.background = new THREE.Color(0x000000);
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = LIGHT.environment;
    pmrem.dispose();
    this.scene.add(this.sunLight, this.sunLight.target, new THREE.AmbientLight(0xffffff, LIGHT.fill));
    this.scene.add(this.markers.points);
    this.cam.up.set(0, 0, 1);

    this.labels = new Labels(opt.labelLayer, (id) => {
      if (id.startsWith('#event')) { const e = this.tr?.events[Number(id.slice(6))]; if (e) opt.onPickEvent?.(e); return; }
      const target: Focus = id === '#craft' ? { kind: 'craft' } : { kind: 'body', id };
      if (opt.onPick) opt.onPick(target); else if (target.kind === 'craft') this.viewCraft(); else this.viewBody(target.id);
    });
    this.camera = new OrbitCamera(opt.canvas);
    this.camera.onUser = () => {
      const was = this.director || this.autoAim;
      this.director = false;
      this.directorWish = false;
      this.autoAim = false;
      this.spin = 0;
      if (was) this.opt.onUserMove?.();
    };
    this.syncBodies();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(opt.canvas.parentElement ?? opt.canvas);
    this.resize();
    void loadManifest(opt.baseUrl).then((m) => { this.manifest = m; }).catch(() => { /* the bodies are then made by code */ }).finally(() => {
      if (this.disposed) return;
      this.manifestReady = true;
      this.stars = createStarfield({ quality: opt.quality, manifest: this.manifest, baseUrl: opt.baseUrl });
      // The local axes of the star sphere are the ICRF axes.
      const x = toWorld([1, 0, 0]), y = toWorld([0, 1, 0]), z = toWorld([0, 0, 1]);
      this.stars.object.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...x), new THREE.Vector3(...y), new THREE.Vector3(...z)));
      this.scene.add(this.stars.object);
    });
    this.frameId = requestAnimationFrame(this.frame);
  }

  // ------------------------------------------------------------------------------------------------ public

  /** Call after a change of the bodies of the user. */
  syncBodies(): void {
    for (const b of BODY_LIST) {
      if (this.byId.has(b.id)) continue;
      const e: Entry = { id: b.id, body: b, top: b.parent === 'SUN' || b.parent === null, pos: [0, 0, 0], valid: false, shown: false, rel: new THREE.Vector3(), dcam: 1, px: 0, visual: null, idle: 0, orbit: null };
      this.entries.push(e);
      this.byId.set(b.id, e);
    }
    for (const e of [...this.entries]) {
      if (BODIES[e.id] === e.body) continue;
      this.dropEntry(e);
      this.entries.splice(this.entries.indexOf(e), 1);
      this.byId.delete(e.id);
      if (BODIES[e.id]) this.syncBodies();
    }
  }

  /**
   * Set the flight to show (null: no flight). craft: model and name of the spacecraft.
   * watch: bodies of the mission (the scene shows them also if they are small bodies).
   */
  setFlight(tr: Trajectory | null, craft: { kind: string; name: string } = { kind: 'apsis', name: '' }, watch: string[] = []): void {
    this.helio?.dispose();
    this.localSsb?.dispose();
    this.localRel?.dispose();
    for (const l of this.spanLines) l?.dispose();
    this.helio = this.localSsb = this.localRel = null;
    this.spanLines = [];
    this.path = null;
    this.tr = tr;
    this.lastEt = NaN;
    this.watch = new Set(watch);
    this.craftName = craft.name;
    const kind = (SPACECRAFT_KINDS as string[]).includes(craft.kind) ? (craft.kind as SpacecraftKind) : 'apsis';
    if (kind !== this.craftKind) { this.dropCraft(); this.craftKind = kind; }
    if (tr && !this.craft) {
      // The size of the model gives the distance of the camera: make the model now.
      this.craft = buildSpacecraft(this.craftKind);
      this.craft.object.scale.setScalar(0.001);
      this.craft.object.visible = false;
      this.scene.add(this.craft.object);
    }
    if (!tr) {
      if (this.focus.kind === 'craft') { this.focus = { kind: 'body', id: 'SUN' }; this.transition = null; }
      return;
    }
    // Bodies near which the path is also drawn relative to the body: those of the mission and those of the encounters.
    const near = new Set<string>(watch);
    for (const e of tr.events) if (e.body && e.type === 'periapsis') near.add(BODIES[e.body]?.parent === 'SUN' ? e.body : BODIES[e.body]?.parent ?? e.body);
    near.add('EARTH');
    this.path = buildPath(this.sys, tr, [...near].filter((id) => id !== 'SUN' && BODIES[id]));
    let far = 0;
    for (let k = 0; k < this.path.count; k++) far = Math.max(far, Math.hypot(this.path.points[3 * k], this.path.points[3 * k + 1], this.path.points[3 * k + 2]));
    this.pathRadius = far;
    this.helio = new PathLine({ color: COLOR_PAST, futureColor: COLOR_FUTURE, width: 1.8, renderOrder: 22 });
    this.helio.setPoints(this.path.points, this.path.count, this.path.times, this.path.spanOf, undefined, this.path.edges);
    this.localSsb = new PathLine({ color: COLOR_PAST, futureColor: COLOR_FUTURE, width: 1.8, renderOrder: 22, dynamic: LOCAL_POINTS });
    this.localRel = new PathLine({ color: COLOR_PAST, futureColor: COLOR_FUTURE, width: 1.8, renderOrder: 23, dynamic: LOCAL_POINTS });
    this.scene.add(this.helio.mesh, this.localSsb.mesh, this.localRel.mesh);
    this.spanLines = this.path.spans.map((s, k) => {
      if (k >= MAX_SPANS) return null;
      const l = new PathLine({ color: COLOR_PAST, futureColor: COLOR_FUTURE, width: 1.8, renderOrder: 23 });
      l.setPoints(s.points, s.count, s.times, null, undefined, s.edges);
      this.scene.add(l.mesh);
      return l;
    });
    this.spanFade.length = 0;
    if (this.directorWish) this.setDirector(true, { immediate: true });
  }

  /** Look at the spacecraft from near (true size). */
  viewCraft(opt: { immediate?: boolean; auto?: boolean } = {}): void {
    if (!this.tr) return;
    this.updatePositions(this.opt.time());
    const radius = (this.craft?.radius ?? 6) / 1000;
    // The radius of a model includes its long booms: the body of the spacecraft is much smaller.
    const dist = radius * (this.aspect < 1 ? 3.0 : 2.1);
    this.camera.minDist = radius * 0.35;
    this.autoAim = opt.auto ?? true;
    this.go({ kind: 'craft' }, dist, opt.immediate ? 0 : 2.2, this.autoAim ? this.aimPose() : undefined);
  }
  /**
   * Look at a body. distanceRadii: distance of the camera in equatorial radii. fill: the part of the smaller side
   * of the view that the body (with its rings) fills. Default: the body fills a large part of the view.
   * includeKm: with fill, a sphere of this radius around the body is also in that part of the view.
   * pose: direction of the camera as seen from the body. Default: from the side of the Sun.
   */
  viewBody(id: string, opt: { immediate?: boolean; distanceRadii?: number; fill?: number; includeKm?: number; pose?: { az: number; el: number } } = {}): void {
    const e = this.byId.get(id);
    if (!e) return;
    this.updatePositions(this.opt.time());
    const extent = this.bodyExtent(e);
    const dist = opt.distanceRadii ? opt.distanceRadii * e.body.radius
      : opt.fill ? this.fillDistance(Math.max(extent, opt.includeKm ?? 0), opt.fill)
      : extent * (this.aspect < 1 ? 7.5 : 4.2);
    this.camera.minDist = e.body.radius * 1.03;
    this.autoAim = false;
    // From the side of the Sun, with the Sun 35 degrees to the left: most of the disc is in sunlight.
    let pose = opt.pose;
    if (!pose && id !== 'SUN' && e.valid) {
      const sun = this.byId.get('SUN')!;
      pose = { az: Math.atan2(sun.pos[1] - e.pos[1], sun.pos[0] - e.pos[0]) - 0.6, el: 0.2 };
    }
    this.go({ kind: 'body', id }, dist, opt.immediate ? 0 : 2.0, pose);
  }
  /**
   * Look at the solar system from above: the Sun in the middle, the spacecraft (or the given distance) in the view.
   * fit: all of the flight path is in the view.
   */
  viewSystem(opt: { immediate?: boolean; radiusKm?: number; fit?: boolean } = {}): void {
    this.camera.minDist = BODIES.SUN.radius * 1.03;
    this.autoAim = false;
    this.updatePositions(this.opt.time());
    const radius = opt.radiusKm ?? (opt.fit && this.tr ? this.pathRadius : undefined);
    this.go({ kind: 'body', id: 'SUN' }, this.systemDistance(radius), opt.immediate ? 0 : 2.2, { az: this.camera.az, el: 0.95 });
  }
  /** Automatic camera (see DirectorMode). immediate: the first view shows with no camera motion. */
  setDirector(on: boolean, opt: { immediate?: boolean } = {}): void {
    this.directorWish = on;
    this.director = on && !!this.tr;
    if (!this.director) { this.autoAim = false; return; }
    this.updatePositions(this.opt.time());
    const want = this.directorWant();
    this.directorApply(want.mode, want.body, opt.immediate ?? false);
  }
  /**
   * Position of the focus on the screen: distance from the middle in half-sizes of the view (x to the right, y up).
   * Use it when a panel covers a part of the view.
   */
  setShift(x: number, y: number, immediate = false): void { this.shiftBase.set(x, y); if (immediate) this.shiftJump = true; }
  /**
   * How the picture of a body is made: from a map of images, from a calculation, or from the two (see the notes of
   * the body module). null: the body has no 3D object at this time (it is a dot in the view).
   */
  picture(id: string): { provenance: 'map' | 'procedural' | 'mixed'; notes: string[] } | null {
    const v = this.byId.get(id)?.visual;
    return v ? { provenance: v.provenance, notes: v.notes } : null;
  }
  /** Slow turn of the view until the user moves it, rad/s. */
  setSpin(rate: number): void { this.spin = rate; }
  /** smallBodies: show all asteroids, comets and dwarf planets (default: only those of the flight). */
  setLayers(p: { labels?: boolean; orbits?: boolean; smallBodies?: boolean }): void {
    if (p.labels !== undefined) this.showLabels = p.labels;
    if (p.orbits !== undefined) this.showOrbits = p.orbits;
    if (p.smallBodies !== undefined) this.showSmall = p.smallBodies;
    this.lastEt = NaN;
  }
  /** Automatic time rate (simulation seconds for each second) for the geometry of this moment. 0: no flight. */
  get autoRate(): number { return this.rateNow; }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    this.observer.disconnect();
    this.camera.dispose();
    this.labels.dispose();
    for (const e of this.entries) this.dropEntry(e);
    this.helio?.dispose();
    this.localSsb?.dispose();
    this.localRel?.dispose();
    for (const l of this.spanLines) l?.dispose();
    this.dropCraft();
    this.markers.dispose();
    this.stars?.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }

  // ------------------------------------------------------------------------------------------------ camera

  private get aspect(): number { return this.width / this.height; }
  /** Radius of the sphere that contains a body and its rings, km. */
  private bodyExtent(e: Entry): number {
    // A small body is not round: its longest axis is about two times its mean radius.
    return e.body.rings ? e.body.rings.outer : e.body.radius >= 200 ? e.body.radius : e.visual ? Math.max(e.visual.extentKm, e.body.radius) : 1.8 * e.body.radius;
  }
  /** Distance of the camera at which a sphere of a radius (km) fills a part of the smaller side of the view. */
  private fillDistance(radiusKm: number, fill: number): number {
    const half = Math.tan((this.cam.fov * Math.PI) / 360) * Math.min(1, this.aspect);
    return radiusKm / Math.sin(Math.atan(Math.max(0.02, Math.min(0.95, fill)) * half));
  }
  private systemDistance(radiusKm?: number): number {
    const sun = this.byId.get('SUN')!;
    const r = radiusKm ?? (this.tr ? Math.hypot(this.craftPos[0] - sun.pos[0], this.craftPos[1] - sun.pos[1], this.craftPos[2] - sun.pos[2]) : 1.6 * AU);
    return Math.max(r, 1.3 * AU) * (this.aspect < 1 ? 4.6 : 2.7);
  }
  private go(focus: Focus, dist: number, seconds: number, pose?: { az: number; el: number }): void {
    const same = focus.kind === this.focus.kind && (focus.kind === 'craft' || focus.id === (this.focus as { id: string }).id);
    if (seconds <= 0) {
      this.transition = null;
      this.focus = focus;
      this.camera.set({ dist, ...pose });
      return;
    }
    if (!same) { this.transition = { from: this.focus, zoomOut: dist > this.camera.dist }; this.focus = focus; }
    this.camera.animateTo({ dist, ...pose }, seconds);
  }
  private focusPos(f: Focus, out: Vec3): Vec3 {
    const p = f.kind === 'craft' ? this.craftPos : this.byId.get(f.id)?.pos ?? this.byId.get('SUN')!.pos;
    out[0] = p[0]; out[1] = p[1]; out[2] = p[2];
    return out;
  }
  /** Apparent radius of the body that is nearest in the view of the spacecraft, rad. */
  private apparent(): number {
    const n = this.info.near;
    return n ? BODIES[n.id].radius / n.distanceKm : 0;
  }
  /** True if the automatic camera has a body behind the spacecraft (false: the cruise, far from all bodies). */
  private aimHasBody(): boolean { return !!this.info.near && this.apparent() >= 0.25 * DIRECTOR_OUT; }
  /**
   * Direction of the camera that shows the spacecraft with the nearest body behind it.
   * The camera is not on the line from the body to the spacecraft: with the spacecraft in the middle of the view,
   * the body is at the edge of the view (to the side on a wide screen, above on a tall screen). The automatic
   * camera then moves the view (shiftAim): the spacecraft is on one side and the body on the other side.
   * The camera is on the side of the Sun where that is possible: the spacecraft is in sunlight.
   */
  private aimPose(): { az: number; el: number } {
    const near = this.aimHasBody() ? this.byId.get(this.info.near!.id) : undefined;
    const sun = this.byId.get('SUN')!;
    const c = this.craftPos;
    const s = new THREE.Vector3(sun.pos[0] - c[0], sun.pos[1] - c[1], sun.pos[2] - c[2]).normalize();
    // In the cruise the camera is on the side of the Sun.
    const b = near ? new THREE.Vector3(near.pos[0] - c[0], near.pos[1] - c[1], near.pos[2] - c[2]).normalize() : s.clone().negate();
    const up = new THREE.Vector3(0, 0, 1);
    const e1 = new THREE.Vector3().crossVectors(up, b);
    if (e1.lengthSq() < 1e-6) e1.set(1, 0, 0);
    e1.normalize();
    if (e1.dot(s) < 0) e1.negate();
    const e2 = new THREE.Vector3().crossVectors(b, e1).normalize();
    if (e2.z < 0) e2.negate();
    const portrait = this.aspect < 1;
    const vHalf = (this.cam.fov * Math.PI) / 360;
    // A tall screen has controls at its top and at its bottom: the body is nearer to the spacecraft in the view.
    const sigma = !near ? 0.5 : portrait ? Math.atan(0.66 * Math.tan(vHalf)) : Math.atan(Math.tan(vHalf) * this.aspect);
    const e = portrait ? e2.multiplyScalar(0.97).addScaledVector(e1, 0.22) : e1.multiplyScalar(0.96).addScaledVector(e2, 0.28);
    const d = b.multiplyScalar(-Math.cos(sigma)).addScaledVector(e.normalize(), Math.sin(sigma)).normalize();
    return { az: Math.atan2(d.y, d.x), el: Math.asin(Math.max(-1, Math.min(1, d.z))) };
  }
  /** The view that the automatic camera uses for the geometry of this moment. */
  private directorWant(): { mode: DirectorMode; body: string } {
    const n = this.info.near, a = this.apparent(), now = this.directorMode;
    if (!n || a < (now === 'system' ? DIRECTOR_IN : DIRECTOR_OUT)) return { mode: 'system', body: '' };
    const e = this.byId.get(n.id)!, sun = this.byId.get('SUN')!, c = this.craftPos;
    // Near the body and above its night side, the side of the body below the spacecraft is dark: the view from
    // the spacecraft would be black. The camera then looks at the body and the flight path from the side.
    const ux = c[0] - e.pos[0], uy = c[1] - e.pos[1], uz = c[2] - e.pos[2];
    const sx = sun.pos[0] - e.pos[0], sy = sun.pos[1] - e.pos[1], sz = sun.pos[2] - e.pos[2];
    // Cosine of the angle at the body between the Sun and the spacecraft: -1 = the middle of the night side.
    const phase = (ux * sx + uy * sy + uz * sz) / (Math.hypot(sx, sy, sz) * Math.max(Math.hypot(ux, uy, uz), 1e-9));
    const hold = now === 'body' && this.directorBody === n.id;
    const dark = phase < (hold ? NIGHT_OUT : NIGHT_IN);
    if (a > (hold ? DIRECTOR_CLOSE_OUT : DIRECTOR_CLOSE) && dark) return { mode: 'body', body: n.id };
    return { mode: 'craft', body: '' };
  }
  private directorApply(mode: DirectorMode, body: string, immediate: boolean): void {
    this.directorMode = mode;
    this.directorBody = body;
    if (mode === 'craft') this.viewCraft({ immediate });
    else if (mode === 'body') this.viewBody(body, { immediate, fill: BODY_FILL, includeKm: this.craftReach(body), pose: this.shadowPose(body) });
    else this.viewSystem({ immediate });
    this.director = true;
  }
  /** Radius around a body that contains the spacecraft with a margin, km. */
  private craftReach(body: string): number {
    const e = this.byId.get(body)!, c = this.craftPos;
    return 1.15 * Math.hypot(c[0] - e.pos[0], c[1] - e.pos[1], c[2] - e.pos[2]);
  }
  /**
   * Direction of the camera for the view of a body while the spacecraft is above its night side.
   * The camera is on the normal of the plane of the direction to the Sun and the velocity of the spacecraft
   * relative to the body, on the side of the body on which the spacecraft goes by: the Sun is to one side, the
   * spacecraft moves across the night side and the body does not hide it. Then the camera turns some degrees to
   * the Sun: more than half of the disc is in sunlight.
   */
  private shadowPose(body: string): { az: number; el: number } {
    const e = this.byId.get(body)!, sun = this.byId.get('SUN')!, c = this.craftPos, v = this.craftVel;
    const s = new THREE.Vector3(sun.pos[0] - e.pos[0], sun.pos[1] - e.pos[1], sun.pos[2] - e.pos[2]).normalize();
    const bv = toWorld(this.sys.state(body, this.opt.time()).v, this.tmpB);
    const w = new THREE.Vector3(v[0] - bv[0], v[1] - bv[1], v[2] - bv[2]);
    const u = new THREE.Vector3(c[0] - e.pos[0], c[1] - e.pos[1], c[2] - e.pos[2]);
    const n = new THREE.Vector3().crossVectors(s, w);
    if (n.lengthSq() < 1e-9 * w.lengthSq() || n.lengthSq() === 0) n.set(-s.y, s.x, 0);
    n.normalize();
    if (n.dot(u) < 0) n.negate();
    n.multiplyScalar(Math.cos(SHADOW_TILT)).addScaledVector(s, Math.sin(SHADOW_TILT)).normalize();
    return { az: Math.atan2(n.y, n.x), el: Math.asin(Math.max(-1, Math.min(1, n.z))) };
  }

  // ------------------------------------------------------------------------------------------------ objects

  private dropEntry(e: Entry): void {
    e.visual?.dispose();
    e.visual = null;
    e.orbit?.line.dispose();
    e.orbit = null;
  }
  private dropCraft(): void {
    if (!this.craft) return;
    this.craft.object.removeFromParent();
    this.craft.dispose();
    this.craft = null;
  }
  private resize(): void {
    const el = this.opt.canvas.parentElement ?? this.opt.canvas;
    const w = Math.max(1, el.clientWidth), h = Math.max(1, el.clientHeight);
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = w; this.height = h;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    this.cam.aspect = w / h;
    // A narrow screen has a larger vertical field: the horizontal field stays useful.
    this.cam.fov = w < h ? 56 : 40;
    this.cam.updateProjectionMatrix();
    this.lastEt = NaN;
  }

  private readonly tmpA: Vec3 = [0, 0, 0];
  private readonly tmpB: Vec3 = [0, 0, 0];
  private readonly tmpC: Vec3 = [0, 0, 0];
  private readonly v1 = new THREE.Vector3();
  private readonly v2 = new THREE.Vector3();
  private readonly v3 = new THREE.Vector3();
  private readonly m4 = new THREE.Matrix4();
  private readonly casters: ShadowCaster[] = Array.from({ length: 4 }, () => ({ pos: new THREE.Vector3(), radiusKm: 0 }));

  /** Positions of the bodies and of the spacecraft at a time. */
  private updatePositions(et: number, dt = 0): void {
    const sys = this.sys, tr = this.tr;
    for (const e of this.entries) {
      const [lo, hi] = sys.coverage(e.id);
      e.valid = et >= Math.max(lo, sys.etStart) && et <= Math.min(hi, sys.etEnd);
      if (e.valid) toWorld(sys.position(e.id, et, this.tmpA), e.pos);
    }
    if (tr) {
      const lo = Math.min(tr.et0, tr.et1), hi = Math.max(tr.et0, tr.et1);
      const s = tr.stateAt(Math.max(lo, Math.min(hi, et)));
      toWorld(s.r, this.craftPos);
      toWorld(s.v, this.craftVel);
      this.updateNear(et, dt);
    } else { this.info.near = null; this.rateNow = 0; }
  }

  private frame = (now: number): void => {
    if (this.disposed) return;
    this.frameId = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, Math.max(0.001, (now - this.last) / 1000));
    this.last = now;
    if (document.hidden) return;
    const et = this.opt.time();
    const tr = this.tr;

    this.updatePositions(et, dt);
    const sun = this.byId.get('SUN')!;

    // Automatic camera.
    if (this.director && tr) {
      const want = this.directorWant();
      if ((want.mode !== this.directorMode || want.body !== this.directorBody) && !this.camera.animating) this.directorApply(want.mode, want.body, false);
      else if (this.directorMode === 'system' && !this.camera.animating && !this.camera.dragging) {
        const target = this.systemDistance();
        this.camera.dist *= Math.pow(target / this.camera.dist, 1 - Math.exp(-dt / 1.5));
      } else if (this.directorMode === 'body' && !this.camera.animating && !this.camera.dragging && this.byId.get(this.directorBody)?.valid) {
        // The spacecraft stays in the view while it moves away from the body.
        const b = this.byId.get(this.directorBody)!;
        const target = this.fillDistance(Math.max(this.bodyExtent(b), this.craftReach(b.id)), BODY_FILL);
        this.camera.dist *= Math.pow(target / this.camera.dist, 1 - Math.exp(-dt / 1.2));
      }
    }
    const aiming = this.autoAim && this.focus.kind === 'craft';
    if (aiming) { const p = this.aimPose(); this.camera.follow(p.az, p.el, dt, 0.3); }
    if (this.spin && !this.camera.dragging && !this.camera.animating) this.camera.set({ az: this.camera.az + this.spin * dt });
    let moved = this.camera.update(dt);
    // Position of the focus on the screen.
    const sx = this.shiftBase.x + (aiming ? this.shiftAim.x : 0), sy = this.shiftBase.y + (aiming ? this.shiftAim.y : 0);
    if (Math.abs(sx - this.shift.x) + Math.abs(sy - this.shift.y) > 1e-4) {
      const k = this.shiftJump ? 1 : 1 - Math.exp(-dt / 0.45);
      this.shift.x += (sx - this.shift.x) * k; this.shift.y += (sy - this.shift.y) * k;
      moved = true;
    }
    this.shiftJump = false;
    if (et !== this.lastEt && this.lastEt === this.lastEt) this.effects += dt;
    // With no change of the time and of the camera, the picture changes only slowly (clouds, the surface of the Sun,
    // textures that arrive): draw 6 pictures for each second.
    if (moved || et !== this.lastEt || this.camera.dragging) this.still = 0; else this.still += dt;
    this.lastEt = et;
    if (this.still > 0.5 && this.still - dt > 0.5 && Math.floor(this.still * 6) === Math.floor((this.still - dt) * 6)) return;

    // Origin of the scene: the focus (between two objects during a change of the focus).
    const o = this.focusPos(this.focus, this.origin);
    if (this.transition && this.camera.animating) {
      const a = this.focusPos(this.transition.from, this.tmpB);
      const sep = Math.hypot(a[0] - o[0], a[1] - o[1], a[2] - o[2]);
      if (sep > 0) {
        const x = this.camera.dist / sep, u = this.camera.progress;
        const wOld = this.transition.zoomOut ? Math.min(1 - smooth(0.03, 0.8, x), 1 - smooth(0.65, 1, u)) : Math.max(smooth(0.03, 0.8, x), 1 - smooth(0, 0.35, u));
        for (let k = 0; k < 3; k++) o[k] += wOld * (a[k] - o[k]);
      }
    } else this.transition = null;

    // Camera.
    const cam = this.cam;
    const dist = this.camera.dist, ce = Math.cos(this.camera.el);
    cam.position.set(dist * ce * Math.cos(this.camera.az), dist * ce * Math.sin(this.camera.az), dist * Math.sin(this.camera.el));
    cam.lookAt(0, 0, 0);
    const focusRadius = this.focus.kind === 'body' && !this.transition ? this.byId.get(this.focus.id)?.body.radius ?? 0 : 0;
    cam.near = Math.max(1e-6, Math.min(dist * 0.02, focusRadius > 0 ? Math.max(dist - focusRadius, 1e-3) * 0.25 : Infinity));
    cam.updateProjectionMatrix();
    cam.projectionMatrix.elements[8] = -this.shift.x;
    cam.projectionMatrix.elements[9] = -this.shift.y;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    cam.updateMatrixWorld();
    const fpx = this.height / (2 * Math.tan((cam.fov * Math.PI) / 360));
    const bufW = this.width * this.pixelRatio, bufH = this.height * this.pixelRatio;
    this.info.focus = this.focus;
    this.info.cameraDistanceKm = dist;
    this.info.director = this.director ? this.directorMode : null;
    // The automatic camera puts the spacecraft on one side of the view and the body on the other side.
    this.shiftAim.set(0, 0);
    if (aiming && this.aimHasBody()) {
      const b = this.byId.get(this.info.near!.id)!;
      const v = this.v1.set(b.pos[0] - o[0], b.pos[1] - o[1], b.pos[2] - o[2]).applyMatrix4(cam.matrixWorldInverse);
      if (v.z < 0) {
        const ty = Math.tan((cam.fov * Math.PI) / 360);
        const clamp = (x: number): number => Math.max(-0.45, Math.min(0.45, x));
        this.shiftAim.set(clamp((-AIM_SHIFT * v.x) / (-v.z * ty * cam.aspect)), clamp((-AIM_SHIFT * v.y) / (-v.z * ty)));
      }
    }

    // Bodies.
    const time = this.effects;
    this.markers.begin(this.pixelRatio);
    this.labels.begin();
    const big: Entry[] = [];
    for (const e of this.entries) {
      if (!e.valid) { if (e.visual) e.visual.object.visible = false; if (e.orbit) e.orbit.line.setOpacity(0); e.shown = false; continue; }
      e.rel.set(e.pos[0] - o[0], e.pos[1] - o[1], e.pos[2] - o[2]);
      e.dcam = Math.max(1e-9, e.rel.distanceTo(cam.position));
      e.px = (e.body.radius / e.dcam) * fpx;
      const isFocus = this.focus.kind === 'body' && this.focus.id === e.id;
      e.shown = e.top ? this.showSmall || MAJOR.has(e.id) || this.watch.has(e.id) || isFocus : true;
      const extent = e.visual ? e.visual.extentKm : e.body.rings ? e.body.rings.outer : e.body.radius;
      const pxExtent = (extent / e.dcam) * fpx;
      if (pxExtent > 1.3 && this.manifestReady && (e.shown || e.px > 1.3)) {
        e.idle = 0;
        if (!e.visual) {
          e.visual = createBody(e.id, { quality: this.opt.quality, manifest: this.manifest, baseUrl: this.opt.baseUrl });
          this.scene.add(e.visual.object);
        }
      } else if (e.visual) {
        e.idle += dt;
        if (e.idle > 4 && pxExtent < 0.8) { e.visual.dispose(); e.visual = null; }
      }
      if (e.visual) {
        const ax = bodyAxes(e.body, et);
        const x = toWorld(ax.x, this.tmpA), y = toWorld(ax.y, this.tmpB);
        this.v1.set(x[0], x[1], x[2]); this.v2.set(y[0], y[1], y[2]);
        const z = toWorld(ax.z, this.tmpA);
        this.v3.set(z[0], z[1], z[2]);
        e.visual.object.quaternion.setFromRotationMatrix(this.m4.makeBasis(this.v1, this.v2, this.v3));
        e.visual.object.position.copy(e.rel);
        e.visual.object.visible = true;
        if (e.px > 8) big.push(e);
      }
    }
    for (const e of this.entries) {
      if (!e.visual || !e.valid) continue;
      // Bodies that can hide the Sun: the planet of a moon, the moons of a planet.
      let n = 0;
      for (const c of this.entries) {
        if (n >= 4) break;
        if (c === e || !c.valid || !(c.id === e.body.parent && c.id !== 'SUN') && c.body.parent !== e.id) continue;
        this.casters[n].pos.set(c.pos[0] - e.pos[0], c.pos[1] - e.pos[1], c.pos[2] - e.pos[2]);
        this.casters[n].radiusKm = c.body.radius;
        n++;
      }
      for (let k = n; k < 4; k++) this.casters[k].radiusKm = 0;
      this.v1.set(sun.pos[0] - e.pos[0], sun.pos[1] - e.pos[1], sun.pos[2] - e.pos[2]);
      const sunDistanceKm = this.v1.length();
      if (sunDistanceKm > 0) this.v1.multiplyScalar(1 / sunDistanceKm); else this.v1.set(1, 0, 0);
      this.v2.copy(cam.position).sub(e.rel);
      e.visual.update({ sunDir: this.v1, cameraPos: this.v2, time, shadowCasters: this.casters, sunDistanceKm });
    }

    // Marks, labels and orbits of the bodies.
    for (const e of this.entries) {
      if (!e.valid) continue;
      const parent = e.top ? null : this.byId.get(e.body.parent!);
      // A moon shows when its orbit is large enough on the screen.
      const orbitPx = parent ? (Math.hypot(e.pos[0] - parent.pos[0], e.pos[1] - parent.pos[1], e.pos[2] - parent.pos[2]) / parent.dcam) * fpx : Infinity;
      const moonAlpha = parent ? smooth(10, 36, orbitPx) : 1;
      const shown = e.shown && moonAlpha > 0;
      if (shown) {
        const size = e.id === 'SUN' ? 8 : e.body.kind === 'planet' ? 6 : 5;
        this.markers.add(e.rel.x, e.rel.y, e.rel.z, e.body.color, size, 'dot', moonAlpha * (1 - smooth(2, 5, e.px)));
        if (this.showLabels && moonAlpha > 0.6 && e.px < 0.2 * Math.min(this.width, this.height)) this.label(e.id, this.opt.bodyName(e.id), e.rel, e.px, e, big, parent ? 'moon' : '');
      }
      // Near a body or near the spacecraft, the orbits of the planets are lines across the view that show nothing: they fade.
      const wide = parent ? 1 : smooth(1.5e6, 2.5e7, dist);
      this.updateOrbit(e, et, shown && this.showOrbits && (!parent || orbitPx > 10) ? moonAlpha * wide * (1 - smooth(4, 14, e.px)) : 0, parent, bufW, bufH);
    }

    this.updateFlight(et, bufW, bufH, fpx, big, time, sun);
    this.markers.end();
    this.labels.end();
    this.renderer.render(this.scene, cam);
  };

  private label(id: string, text: string, rel: THREE.Vector3, px: number, self: Entry | null, big: Entry[], cls: string): void {
    const cam = this.cam;
    const p = this.v1.copy(rel).project(cam);
    if (p.z < -1 || p.z > 1 || Math.abs(p.x) > 1.02 || Math.abs(p.y) > 1.02) return;
    // A body in front of the object hides the label.
    const dx = rel.x - cam.position.x, dy = rel.y - cam.position.y, dz = rel.z - cam.position.z;
    const len = Math.hypot(dx, dy, dz);
    for (const b of big) {
      if (b === self) continue;
      const bx = b.rel.x - cam.position.x, by = b.rel.y - cam.position.y, bz = b.rel.z - cam.position.z;
      const along = (bx * dx + by * dy + bz * dz) / len;
      if (along <= 0 || along >= len) continue;
      const off2 = bx * bx + by * by + bz * bz - along * along;
      if (off2 < b.body.radius * b.body.radius) return;
    }
    const x = (p.x + 1) * 0.5 * this.width + Math.max(0, 0.72 * px - 6), y = (1 - p.y) * 0.5 * this.height - Math.max(0, 0.72 * px - 6);
    // The label of an event is above its mark: the flight path goes through the mark.
    this.labels.place(id, text, x, cls === 'event' ? y - 13 : y, cls);
  }

  private updateOrbit(e: Entry, et: number, alpha: number, parent: Entry | null | undefined, bufW: number, bufH: number): void {
    if (e.id === 'SUN') return;
    if (alpha <= 0.01) { e.orbit?.line.setOpacity(0); return; }
    if (!e.orbit) {
      const c = new THREE.Color(e.body.color).lerp(new THREE.Color('#8fa0c0'), 0.35);
      e.orbit = { line: new PathLine({ color: c, width: 1.2, renderOrder: 18, dynamic: 258 }), data: null };
      this.scene.add(e.orbit.line.mesh);
    }
    const ob = e.orbit;
    // The body is between two points of the line. If the body is not a point on the screen, the line would not go
    // through it: sample the orbit again, with the body at a point of the line.
    const exact = !parent && e.px > 0.4 && ob.data !== null && ob.data.et !== et;
    if (!ob.data || exact || Math.abs(et - ob.data.et) > 0.2 * ob.data.period) {
      const d = sampleOrbit(this.sys, e.id, parent ? parent.id : 'SSB', et, parent ? 192 : 256, ob.data);
      if (!d) { ob.line.setOpacity(0); return; }
      ob.data = d;
      ob.line.setPoints(d.points, d.count, d.times);
      ob.line.setAge(d.period, 0.2);
    }
    const o = this.origin;
    if (parent) ob.line.setOrigin(o[0] - parent.pos[0], o[1] - parent.pos[1], o[2] - parent.pos[2]); else ob.line.setOrigin(o[0], o[1], o[2]);
    ob.line.setNow(et);
    ob.line.setView(bufW, bufH, this.pixelRatio, this.cam.near);
    ob.line.setOpacity((parent ? 0.42 : 0.8) * alpha);
  }

  /** Body with the largest apparent size as seen from the spacecraft, and the automatic time rate. */
  private updateNear(et: number, dt: number): void {
    const c = this.craftPos, v = this.craftVel;
    let best: Entry | null = null, bestA = 0, bestD = 0;
    for (const e of this.entries) {
      if (!e.valid || e.id === 'SUN') continue;
      const d = Math.hypot(e.pos[0] - c[0], e.pos[1] - c[1], e.pos[2] - c[2]);
      const a = e.body.radius / Math.max(d, 1e-9);
      if (a > bestA) { bestA = a; best = e; bestD = d; }
    }
    if (!best) { this.info.near = null; return; }
    const bv = toWorld(this.sys.state(best.id, et).v, this.tmpB);
    const speed = Math.hypot(v[0] - bv[0], v[1] - bv[1], v[2] - bv[2]);
    this.info.near = { id: best.id, distanceKm: bestD, altitudeKm: bestD - best.body.radius, speedKmS: speed };
    // Time rate: the distance to the surface of the nearest body changes by a constant factor in k seconds of the
    // display. k is small while the body is a dot (a fast approach) and large when the body is large in the view:
    // the direction of the body then changes by 10 degrees each second at most, and the camera can follow it.
    const tr = this.tr!;
    const span = Math.abs(tr.et1 - tr.et0);
    const k = 2.2 + 3.8 * smooth(-2.6, -1.5, Math.log10(Math.max(bestA, 1e-12)));
    const target = Math.max(120, Math.min(span / 22, Math.max(bestD - 0.9 * best.body.radius, 50) / (Math.max(speed, 1) * k)));
    // While the time runs, the rate goes to this value with a time constant of 0.13 s. With the time stopped, or
    // after a jump of the time, the rate is this value. A call that is not from a frame (dt = 0) keeps the rate.
    if (dt > 0 || this.rateNow <= 0) {
      const runs = this.rateNow > 0 && et !== this.lastEt && Math.abs(et - this.lastEt) < 4 * this.rateNow * dt;
      this.rateNow = runs ? this.rateNow * Math.pow(target / this.rateNow, 1 - Math.exp(-dt / 0.13)) : target;
    }
    this.opt.onRate?.(this.rateNow);
  }

  /**
   * Points of a path in one segment of its line, with small steps near the time of the view. The steps start at
   * some percent of the distance between the camera and the spacecraft and each step is longer than the step before.
   * pos gives the position at a time. The points are relative to the position at the time of the view.
   * Returns the number of points (in localPts and localTimes).
   */
  private refine(pos: (t: number, out: Vec3) => void, t0: number, t1: number, et: number, speed: number, dist: number): number {
    const P = this.localPts, T = this.localTimes, c = this.tmpC, w = this.tmpA;
    pos(et, c);
    const first = Math.max(1e-4, (0.03 * dist) / Math.max(speed, 0.05));
    const half = (LOCAL_POINTS - 4) >> 1;
    let n = 0;
    const put = (t: number): void => {
      pos(t, w);
      P[3 * n] = w[0] - c[0]; P[3 * n + 1] = w[1] - c[1]; P[3 * n + 2] = w[2] - c[2];
      T[n++] = t;
    };
    const d0 = t0 - et, d1 = t1 - et;
    const steps = (d: number): number => (Math.abs(d) > first ? Math.min(half, Math.ceil(Math.log(Math.abs(d) / first) / Math.log(LOCAL_RATIO))) : 0);
    if (d0 !== 0) {
      put(t0);
      for (let j = steps(d0) - 1; j >= 0; j--) { const tau = first * Math.pow(LOCAL_RATIO, j); if (tau < 0.8 * Math.abs(d0)) put(et + Math.sign(d0) * tau); }
    }
    P[3 * n] = P[3 * n + 1] = P[3 * n + 2] = 0;
    T[n++] = et;
    if (d1 !== 0) {
      const m = steps(d1);
      for (let j = 0; j < m; j++) { const tau = first * Math.pow(LOCAL_RATIO, j); if (tau < 0.8 * Math.abs(d1)) put(et + Math.sign(d1) * tau); }
      put(t1);
    }
    return n;
  }

  /** Draw the segment of the path that contains the spacecraft again, with a point at the spacecraft. */
  private updateLocal(et: number, bufW: number, bufH: number): void {
    const tr = this.tr!, path = this.path!, helio = this.helio!, ssb = this.localSsb!, relLine = this.localRel!;
    const o = this.origin, c = this.craftPos, cam = this.cam;
    const lo = Math.min(tr.et0, tr.et1), hi = Math.max(tr.et0, tr.et1);
    const etc = Math.max(lo, Math.min(hi, et));
    const i = segmentAt(path.times, path.count, etc);
    for (const l of this.spanLines) l?.setHidden(-1, -1);
    if (i < 0) { helio.setHidden(-1, -1); ssb.setOpacity(0); relLine.setOpacity(0); return; }
    const dist = Math.max(1e-6, Math.hypot(c[0] - o[0] - cam.position.x, c[1] - o[1] - cam.position.y, c[2] - o[2] - cam.position.z));
    const v = this.craftVel;
    helio.setHidden(i, i);
    let n = this.refine((t, out) => { toWorld(tr.stateAt(t).r, out); }, path.times[i], path.times[i + 1], etc, Math.hypot(v[0], v[1], v[2]), dist);
    const k = path.spanOf[i];
    // Weight of the path relative to the body at the distance of the spacecraft from the body (see spanWeight).
    const kb = k >= 0 ? this.byId.get(path.spans[k].body) : undefined;
    const weight = kb?.valid ? spanWeight(Math.hypot(c[0] - kb.pos[0], c[1] - kb.pos[1], c[2] - kb.pos[2]), path.spans[k].radiusKm) : 0;
    ssb.setPoints(this.localPts, n, this.localTimes, null, etc);
    ssb.setOrigin(o[0] - c[0], o[1] - c[1], o[2] - c[2]);
    ssb.setNow(et);
    ssb.setView(bufW, bufH, this.pixelRatio, cam.near);
    ssb.setOpacity(k >= 0 && k < MAX_SPANS ? 1 - weight * this.spanFade[k] : 1);
    // With the 3D model in the view, the line stops at the body of the spacecraft.
    const hole = this.info.craftModel ? (0.3 * (this.craft?.radius ?? 0)) / 1000 : 0;
    ssb.setGap(hole / Math.max(Math.hypot(v[0], v[1], v[2]), 1e-3));
    const span = k >= 0 ? path.spans[k] : null, line = k >= 0 ? this.spanLines[k] : null;
    const j = span && line && this.spanFade[k] > 0.003 && etc >= Math.min(span.et0, span.et1) && etc <= Math.max(span.et0, span.et1) ? segmentAt(span.times, span.count, etc) : -1;
    if (!span || !line || j < 0) { relLine.setOpacity(0); return; }
    const sys = this.sys, pb = this.tmpB, body = span.body;
    const bv = toWorld(sys.state(body, etc).v, pb);
    const speed = Math.hypot(v[0] - bv[0], v[1] - bv[1], v[2] - bv[2]);
    line.setHidden(j, j);
    n = this.refine((t, out) => {
      const s = tr.stateAt(t).r;
      sys.position(body, t, pb);
      pb[0] = s[0] - pb[0]; pb[1] = s[1] - pb[1]; pb[2] = s[2] - pb[2];
      toWorld(pb, out);
    }, span.times[j], span.times[j + 1], etc, speed, dist);
    relLine.setPoints(this.localPts, n, this.localTimes, null, etc);
    relLine.setOrigin(o[0] - c[0], o[1] - c[1], o[2] - c[2]);
    relLine.setNow(et);
    relLine.setView(bufW, bufH, this.pixelRatio, cam.near);
    relLine.setOpacity(weight * this.spanFade[k]);
    relLine.setGap(hole / Math.max(speed, 1e-3));
  }

  private updateFlight(et: number, bufW: number, bufH: number, fpx: number, big: Entry[], time: number, sun: Entry): void {
    const tr = this.tr, path = this.path, o = this.origin, cam = this.cam;
    this.info.pathFrames.length = 0;
    if (!tr || !path || !this.helio) { this.info.craftModel = false; if (this.craft) this.craft.object.visible = false; this.sunLight.intensity = 0; return; }
    // Fade of each span: 1 = the part of the path near the body is relative to the body.
    // During an encounter with a body, the path of an encounter with the same body at a different date stays in the
    // barycentric frame: the view shows one path around the body.
    const inSpan = (s: PathData['spans'][number]): boolean => et >= Math.min(s.et0, s.et1) && et <= Math.max(s.et0, s.et1);
    for (let k = 0; k < path.spans.length; k++) {
      const s = path.spans[k];
      const b = this.byId.get(s.body);
      const line = this.spanLines[k];
      let fade = 0;
      const other = !inSpan(s) && path.spans.some((q) => q !== s && q.body === s.body && inSpan(q));
      if (b?.valid && line && !other) {
        fade = 1 - smooth(1.2 * s.radiusKm, 3.5 * s.radiusKm, b.dcam);
        line.setOrigin(o[0] - b.pos[0], o[1] - b.pos[1], o[2] - b.pos[2]);
        line.setNow(et);
        line.setView(bufW, bufH, this.pixelRatio, cam.near);
        line.setOpacity(fade);
        if (fade > 0.5 && !this.info.pathFrames.includes(s.body)) this.info.pathFrames.push(s.body);
      } else line?.setOpacity(0);
      this.spanFade[k] = fade;
      if (k < MAX_SPANS) this.helio.spanAlpha[k] = 1 - fade;
    }
    this.helio.setOrigin(o[0], o[1], o[2]);
    this.helio.setNow(et);
    this.helio.setView(bufW, bufH, this.pixelRatio, cam.near);
    this.updateLocal(et, bufW, bufH);

    // Events of the flight.
    let marks = 0;
    for (const e of tr.events) {
      if (marks >= 160 || (e.type !== 'maneuver' && e.type !== 'periapsis')) continue;
      const w = this.eventPos(e, this.tmpA);
      if (e.type === 'maneuver') this.markers.add(w[0] - o[0], w[1] - o[1], w[2] - o[2], '#ff8a5c', 9, 'diamond', 0.95);
      else this.markers.add(w[0] - o[0], w[1] - o[1], w[2] - o[2], '#bfe0ff', 8, 'ring', 0.9);
      marks++;
    }

    // Spacecraft.
    const c = this.craftPos;
    const rel = this.v3.set(c[0] - o[0], c[1] - o[1], c[2] - o[2]);
    const dcam = Math.max(1e-9, rel.distanceTo(cam.position));
    const radiusKm = (this.craft?.radius ?? 6) / 1000;
    const px = (radiusKm / dcam) * fpx;
    const model = this.craft;
    this.info.craftModel = !!model && px > 2.5;
    if (model) {
      model.object.visible = px > 2.5;
      if (model.object.visible) {
        model.object.position.copy(rel);
        // Example attitude: the antenna points to the Earth, the +Y axis of the model is near the ecliptic north.
        const earth = this.byId.get('EARTH')!;
        const z = this.v1.set(earth.pos[0] - c[0], earth.pos[1] - c[1], earth.pos[2] - c[2]);
        if (z.lengthSq() < 1) z.set(c[0] - sun.pos[0], c[1] - sun.pos[1], c[2] - sun.pos[2]);
        z.normalize();
        const up = Math.abs(z.z) > 0.98 ? this.v2.set(1, 0, 0) : this.v2.set(0, 0, 1);
        const x = new THREE.Vector3().crossVectors(up, z).normalize();
        const y = new THREE.Vector3().crossVectors(z, x);
        // Columns: the directions of the model axes +X, +Y, +Z in the world. The model boresight is +Z.
        const q = model.object.quaternion.setFromRotationMatrix(this.m4.makeBasis(x, y, z));
        if (model.spin) q.multiply(new THREE.Quaternion().setFromAxisAngle(model.spin.axis, (model.spin.rate * time) % (2 * Math.PI)));
        // Sunlight on the spacecraft, less in the shadow of a body.
        const s = this.v2.set(sun.pos[0] - c[0], sun.pos[1] - c[1], sun.pos[2] - c[2]);
        const ds = s.length();
        s.multiplyScalar(1 / ds);
        const thetaS = Math.asin(Math.min(1, BODIES.SUN.radius / ds));
        let lit = 1;
        for (const e of this.entries) {
          if (!e.valid || e.id === 'SUN') continue;
          const bx = e.pos[0] - c[0], by = e.pos[1] - c[1], bz = e.pos[2] - c[2];
          const db = Math.hypot(bx, by, bz);
          if (db <= e.body.radius || e.body.radius / db < 0.2 * thetaS) continue;
          const thetaB = Math.asin(e.body.radius / db);
          const sep = Math.acos(Math.max(-1, Math.min(1, (bx * s.x + by * s.y + bz * s.z) / db)));
          lit *= smooth(thetaB - thetaS, thetaB + thetaS, sep);
        }
        this.sunLight.intensity = LIGHT.sun * lit;
        this.sunLight.position.copy(rel).add(s);
        this.sunLight.target.position.copy(rel);
        this.sunLight.target.updateMatrixWorld();
      }
    }
    this.markers.add(rel.x, rel.y, rel.z, '#ffffff', 12, 'diamond', 1 - smooth(3, 8, px));
    if (this.showLabels && px < 40) this.label('#craft', this.craftName, rel, px, null, big, 'craft');

    // The name of the body and the date at the place of each closest approach. Near the time of the event the body
    // is at that place with its own name: the label is then not necessary.
    if (this.showLabels && this.opt.eventName) {
      marks = 0;
      for (let n = 0; n < tr.events.length && marks < 160; n++) {
        const e = tr.events[n];
        if (e.type !== 'maneuver' && e.type !== 'periapsis') continue;
        marks++;
        if (e.type !== 'periapsis' || Math.abs(e.et - et) < 2 * 86400) continue;
        const text = this.opt.eventName(e);
        if (!text) continue;
        const w = this.eventPos(e, this.tmpA);
        this.label('#event' + n, text, this.v2.set(w[0] - o[0], w[1] - o[1], w[2] - o[2]), 0, null, big, 'event');
      }
    }
  }

  /**
   * Position of an event of the flight in the scene, relative to the solar system barycenter, km. If the view
   * shows the path near the body of the event relative to that body, the position is relative to the place of
   * the body now.
   */
  private eventPos(e: TrajectoryEvent, out: Vec3): Vec3 {
    const spans = this.path!.spans;
    const w = toWorld(e.state.r, out);
    for (let j = 0; j < spans.length; j++) {
      if (e.et < spans[j].et0 || e.et > spans[j].et1 || !(this.spanFade[j] > 0.5)) continue;
      const b = this.byId.get(spans[j].body)!;
      const pb = toWorld(this.sys.position(spans[j].body, e.et, this.tmpB), this.tmpB);
      w[0] += b.pos[0] - pb[0]; w[1] += b.pos[1] - pb[1]; w[2] += b.pos[2] - pb[2];
      break;
    }
    return w;
  }
}
