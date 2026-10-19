// The Figma half of figma-bridge: a read-only command interpreter.
//
// `ui.html` long-polls the local relay for a job, hands it here, and streams
// the answer back. Everything a client can learn about a design is reachable
// through one of the commands in `run()` below. `node` mirrors the shape of
// `GET /v1/files/:key/nodes`, so tools written for the REST API read it
// unchanged. Nothing here edits the document; `select` only moves the view.
//
// Figma loads this as one classic script — no imports — so PROTOCOL is a copy
// of the one in `bridge/lib/protocol.mjs`; a test keeps the three in step.

const PROTOCOL = 1;

const MIXED = figma.mixed;

/** Plugin properties are `figma.mixed` whenever children disagree. */
const plain = (v) => (v === MIXED ? undefined : v);
const nz = (v) => (typeof v === 'number' ? v : undefined);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------- serializer

/** REST folds paint opacity into `color.a` and keeps `opacity` alongside it. */
function paints(list) {
  if (!Array.isArray(plain(list))) return undefined;
  return list.map((p) => {
    const out = { blendMode: p.blendMode, type: p.type };
    if (p.visible === false) out.visible = false;
    if (typeof p.opacity === 'number' && p.opacity !== 1) out.opacity = p.opacity;
    if (p.type === 'SOLID') {
      const a = typeof p.opacity === 'number' ? p.opacity : 1;
      out.color = { r: p.color.r, g: p.color.g, b: p.color.b, a };
    } else if (p.gradientStops) {
      out.gradientHandlePositions = p.gradientTransform;
      out.gradientStops = p.gradientStops.map((s) => ({
        color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a },
        position: s.position,
      }));
    } else if (p.type === 'IMAGE') {
      out.scaleMode = p.scaleMode;
      out.imageRef = p.imageHash;
    }
    return out;
  });
}

function effects(list) {
  if (!Array.isArray(plain(list))) return undefined;
  return list.map((e) => {
    const out = { type: e.type, visible: e.visible !== false, radius: e.radius };
    if (e.color) out.color = { r: e.color.r, g: e.color.g, b: e.color.b, a: e.color.a };
    if (e.offset) out.offset = { x: e.offset.x, y: e.offset.y };
    if (typeof e.spread === 'number') out.spread = e.spread;
    if (e.blendMode) out.blendMode = e.blendMode;
    return out;
  });
}

/** TEXT `style` block. Every field is `mixed` the moment a range overrides it. */
function typeStyle(node) {
  const font = plain(node.fontName);
  const lh = plain(node.lineHeight);
  const ls = plain(node.letterSpacing);
  const style = {
    fontFamily: font ? font.family : undefined,
    fontPostScriptName: font ? `${font.family}-${font.style}`.replace(/\s+/g, '') : undefined,
    fontWeight: nz(plain(node.fontWeight)),
    fontSize: nz(plain(node.fontSize)),
    textAlignHorizontal: node.textAlignHorizontal,
    textAlignVertical: node.textAlignVertical,
    textCase: plain(node.textCase),
    textDecoration: plain(node.textDecoration),
  };
  if (ls && ls.unit === 'PIXELS') style.letterSpacing = ls.value;
  if (ls && ls.unit === 'PERCENT') style.letterSpacingPercent = ls.value;
  if (lh && lh.unit === 'PIXELS') style.lineHeightPx = lh.value;
  if (lh && lh.unit === 'PERCENT') style.lineHeightPercent = lh.value;
  if (lh && lh.unit === 'AUTO') style.lineHeightUnit = 'AUTO';
  return style;
}

/** Drops keys the REST payload would have omitted, so diffs stay readable. */
function compact(obj) {
  for (const k of Object.keys(obj)) if (obj[k] === undefined) delete obj[k];
  return obj;
}

/**
 * @param depth mirrors the REST `depth` param: 1 is the node with no children.
 */
function serialize(node, depth) {
  const out = compact({
    id: node.id,
    name: node.name,
    type: node.type,
    visible: node.visible === false ? false : undefined,
    opacity: node.opacity !== undefined && node.opacity !== 1 ? node.opacity : undefined,
    rotation: nz(node.rotation) ? node.rotation : undefined,
    blendMode: node.blendMode !== 'PASS_THROUGH' ? node.blendMode : undefined,
    clipsContent: typeof node.clipsContent === 'boolean' ? node.clipsContent : undefined,

    absoluteBoundingBox: node.absoluteBoundingBox
      ? {
          x: node.absoluteBoundingBox.x,
          y: node.absoluteBoundingBox.y,
          width: node.absoluteBoundingBox.width,
          height: node.absoluteBoundingBox.height,
        }
      : undefined,

    // Auto layout — padding and itemSpacing are what a layout spec needs most.
    layoutMode: node.layoutMode && node.layoutMode !== 'NONE' ? node.layoutMode : undefined,
    layoutWrap: node.layoutWrap,
    primaryAxisAlignItems: node.primaryAxisAlignItems,
    counterAxisAlignItems: node.counterAxisAlignItems,
    primaryAxisSizingMode: node.primaryAxisSizingMode,
    counterAxisSizingMode: node.counterAxisSizingMode,
    paddingLeft: nz(node.paddingLeft),
    paddingRight: nz(node.paddingRight),
    paddingTop: nz(node.paddingTop),
    paddingBottom: nz(node.paddingBottom),
    itemSpacing: nz(node.itemSpacing),

    cornerRadius: nz(plain(node.cornerRadius)),
    rectangleCornerRadii:
      plain(node.cornerRadius) === undefined && typeof node.topLeftRadius === 'number'
        ? [node.topLeftRadius, node.topRightRadius, node.bottomRightRadius, node.bottomLeftRadius]
        : undefined,

    fills: paints(node.fills),
    strokes: paints(node.strokes),
    strokeWeight: nz(plain(node.strokeWeight)),
    // A one-sided accent border makes `strokeWeight` mixed, and dropping it
    // would hide the border entirely — REST calls the per-side form this.
    individualStrokeWeights:
      plain(node.strokeWeight) === undefined && typeof node.strokeTopWeight === 'number'
        ? {
            top: node.strokeTopWeight,
            right: node.strokeRightWeight,
            bottom: node.strokeBottomWeight,
            left: node.strokeLeftWeight,
          }
        : undefined,
    strokeAlign: node.strokeAlign,
    strokeDashes: Array.isArray(node.dashPattern) && node.dashPattern.length ? node.dashPattern : undefined,
    effects: effects(node.effects),

    characters: node.type === 'TEXT' ? node.characters : undefined,
    style: node.type === 'TEXT' ? compact(typeStyle(node)) : undefined,

    // Variant axes, straight from the set — saves guessing them out of names.
    componentPropertyDefinitions:
      node.type === 'COMPONENT_SET' ? node.componentPropertyDefinitions : undefined,
  });

  if (depth > 1 && Array.isArray(node.children)) {
    out.children = node.children.map((c) => serialize(c, depth - 1));
  }
  return out;
}

// ------------------------------------------------------------------- lookups

// `documentAccess: dynamic-page` keeps pages unloaded until asked. Loading is
// slow on a big library, so it happens once, lazily, and only for the commands
// that genuinely reach outside the current page.
let pagesLoaded = false;
async function loadPages() {
  if (!pagesLoaded) {
    await figma.loadAllPagesAsync();
    pagesLoaded = true;
  }
}

const normaliseId = (id) => String(id).trim().replace(/-/g, ':');

async function getNode(id) {
  const wanted = normaliseId(id);
  let hit = null;
  try {
    hit = await figma.getNodeByIdAsync(wanted);
  } catch (err) {
    hit = null; // usually "page not loaded" — the retry below fixes that
  }
  if (!hit) {
    await loadPages();
    try {
      hit = await figma.getNodeByIdAsync(wanted);
    } catch (err) {
      hit = null;
    }
  }
  if (!hit) throw new Error(`Node ${wanted} not found in this file. Try \`find\` or \`index\`.`);
  return hit;
}

async function getPages(ref) {
  // Loading is per-page on purpose. `loadAllPagesAsync()` does not return
  // within the job timeout on a large production library, and it took the plugin down
  // with it twice. The current page is always loaded and a named page loads
  // on its own, so only the whole-document walk still pays for everything.
  if (!ref) return [figma.currentPage];
  if (ref === '*') {
    await loadPages();
    return figma.root.children.slice();
  }
  const id = normaliseId(ref);
  const want = String(ref).toLowerCase();
  const hit = figma.root.children.find(
    (p) => p.id === id || p.name === ref || p.name.toLowerCase() === want
  );
  if (!hit) {
    const names = figma.root.children.map((p) => p.name).join(', ');
    throw new Error(`Page not found: ${ref}. This file has: ${names}`);
  }
  await hit.loadAsync();
  return [hit];
}

/** Depth-first walk with an early exit, so `find` does not materialise a page. */
function walk(node, visit) {
  const children = node.children;
  if (!Array.isArray(children)) return false;
  for (const child of children) {
    if (visit(child) === false) return true; // stop requested
    if (walk(child, visit)) return true;
  }
  return false;
}

/** `foo` is a substring match; `/foo/i` is a regular expression. */
function matcher(query) {
  if (!query) return () => true;
  const re = /^\/(.*)\/([a-z]*)$/.exec(String(query));
  if (re) {
    const rx = new RegExp(re[1], re[2]);
    return (name) => rx.test(name);
  }
  const needle = String(query).toLowerCase();
  return (name) => String(name).toLowerCase().indexOf(needle) >= 0;
}

const brief = (n) => ({ id: n.id, name: n.name, type: n.type });

const box = (n) =>
  n.absoluteBoundingBox
    ? { width: Math.round(n.absoluteBoundingBox.width), height: Math.round(n.absoluteBoundingBox.height) }
    : undefined;

function summary(n) {
  const out = compact({
    id: n.id,
    name: n.name,
    type: n.type,
    childCount: Array.isArray(n.children) ? n.children.length : undefined,
    size: box(n),
    axes: n.type === 'COMPONENT_SET' ? Object.keys(n.componentPropertyDefinitions || {}) : undefined,
  });
  return out;
}

// ------------------------------------------------------------------- colours

const byte = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));
const hex = (c) =>
  '#' +
  [byte(c.r), byte(c.g), byte(c.b)]
    .map((v) => (v < 16 ? '0' : '') + v.toString(16))
    .join('')
    .toUpperCase();

function colorValue(c) {
  const a = typeof c.a === 'number' ? c.a : 1;
  return {
    hex: hex(c),
    alpha: a,
    css: a === 1 ? hex(c) : `rgba(${byte(c.r)}, ${byte(c.g)}, ${byte(c.b)}, ${Number(a.toFixed(4))})`,
    rgba: { r: c.r, g: c.g, b: c.b, a },
  };
}

// ------------------------------------------------------------------ commands

async function cmdFind(args) {
  const limit = clamp(Number(args.limit) || 200, 1, 5000);
  const types = args.type
    ? String(args.type)
        .toUpperCase()
        .split(/[,\s]+/)
        .filter(Boolean)
    : null;
  const match = matcher(args.query);
  const pages = await getPages(args.page);

  const hits = [];
  let truncated = false;

  for (const page of pages) {
    if (truncated) break;
    let list = null;
    if (types) {
      // Native and far faster than walking the tree in JS — but it rejects an
      // unknown type name, in which case the manual walk below still works.
      try {
        list = page.findAllWithCriteria({ types });
      } catch (err) {
        list = null;
      }
    }
    if (list) {
      for (const n of list) {
        if (!match(n.name)) continue;
        if (hits.length >= limit) {
          truncated = true;
          break;
        }
        hits.push(Object.assign(brief(n), { page: page.name }));
      }
    } else {
      walk(page, (n) => {
        if (types && types.indexOf(n.type) < 0) return;
        if (!match(n.name)) return;
        if (hits.length >= limit) {
          truncated = true;
          return false;
        }
        hits.push(Object.assign(brief(n), { page: page.name }));
      });
    }
  }

  return { query: args.query || '', count: hits.length, truncated, nodes: hits };
}

async function cmdCollect(args, type) {
  const pages = await getPages(args.page);
  const out = [];
  for (const page of pages) {
    walk(page, (n) => {
      if (n.type !== type) return;
      if (type === 'COMPONENT_SET') {
        out.push(
          compact({
            id: n.id,
            name: n.name,
            page: page.name,
            size: box(n),
            axes: n.componentPropertyDefinitions,
            variants: (n.children || []).map((c) => ({ id: c.id, name: c.name })),
          })
        );
      } else {
        const parent = n.parent;
        out.push(
          compact({
            id: n.id,
            name: n.name,
            key: n.key,
            page: page.name,
            size: box(n),
            set: parent && parent.type === 'COMPONENT_SET' ? { id: parent.id, name: parent.name } : undefined,
          })
        );
      }
    });
  }
  return { count: out.length, [type === 'COMPONENT_SET' ? 'sets' : 'components']: out };
}

async function cmdVariables() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const locals = await figma.variables.getLocalVariablesAsync();

  const byId = {};
  for (const v of locals) byId[v.id] = v;
  const collectionById = {};
  for (const c of collections) collectionById[c.id] = c;

  // An alias may point at a library variable, which is not in `locals`.
  async function nameOf(id) {
    let v = byId[id];
    if (!v) {
      try {
        v = await figma.variables.getVariableByIdAsync(id);
      } catch (err) {
        v = null;
      }
    }
    if (!v) return { id, name: '(unresolved)' };
    const c = collectionById[v.variableCollectionId];
    return { id, name: v.name, collection: c ? c.name : undefined };
  }

  const variables = [];
  for (const v of locals) {
    const collection = collectionById[v.variableCollectionId];
    const values = {};
    for (const modeId of Object.keys(v.valuesByMode)) {
      const mode = collection ? collection.modes.find((m) => m.modeId === modeId) : null;
      const key = mode ? mode.name : modeId;
      const raw = v.valuesByMode[modeId];
      if (raw && raw.type === 'VARIABLE_ALIAS') values[key] = { alias: await nameOf(raw.id) };
      else if (v.resolvedType === 'COLOR' && raw && typeof raw.r === 'number') values[key] = colorValue(raw);
      else values[key] = raw;
    }
    variables.push(
      compact({
        id: v.id,
        key: v.key,
        name: v.name,
        type: v.resolvedType,
        collection: collection ? collection.name : undefined,
        description: v.description || undefined,
        scopes: v.scopes && v.scopes.length ? v.scopes : undefined,
        codeSyntax: v.codeSyntax && Object.keys(v.codeSyntax).length ? v.codeSyntax : undefined,
        values,
      })
    );
  }

  return {
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      modes: c.modes.map((m) => ({ id: m.modeId, name: m.name })),
      defaultModeId: c.defaultModeId,
      variableCount: c.variableIds.length,
    })),
    count: variables.length,
    variables,
  };
}

async function cmdStyles() {
  const [paint, text, effect, grid] = await Promise.all([
    figma.getLocalPaintStylesAsync(),
    figma.getLocalTextStylesAsync(),
    figma.getLocalEffectStylesAsync(),
    figma.getLocalGridStylesAsync(),
  ]);

  const head = (s) => compact({ id: s.id, key: s.key, name: s.name, description: s.description || undefined });

  return {
    paint: paint.map((s) =>
      Object.assign(head(s), {
        paints: paints(s.paints),
        // The hex is what a human recognises the style by — worth the two lines.
        hex: (s.paints || [])
          .filter((p) => p.type === 'SOLID' && p.visible !== false)
          .map((p) => colorValue(Object.assign({}, p.color, { a: typeof p.opacity === 'number' ? p.opacity : 1 })).css),
      })
    ),
    text: text.map((s) =>
      Object.assign(head(s), {
        fontFamily: s.fontName ? s.fontName.family : undefined,
        fontStyle: s.fontName ? s.fontName.style : undefined,
        fontSize: s.fontSize,
        lineHeight: s.lineHeight,
        letterSpacing: s.letterSpacing,
        textCase: s.textCase,
        textDecoration: s.textDecoration,
      })
    ),
    effect: effect.map((s) => Object.assign(head(s), { effects: effects(s.effects) })),
    grid: grid.map((s) => Object.assign(head(s), { layoutGrids: s.layoutGrids })),
  };
}

const SCREEN_TYPES = ['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE'];

/**
 * What a designer calls a screen: a frame-like node placed directly on the
 * page, or directly inside a top-level section. Groups and loose shapes on the
 * canvas are scaffolding, not screens.
 */
async function cmdScreens(args) {
  const pages = await getPages(args.page);
  const screens = [];
  const take = (n, page, section) => {
    if (SCREEN_TYPES.indexOf(n.type) < 0) return;
    const size = box(n) || { width: 0, height: 0 };
    screens.push(
      compact({
        id: n.id,
        name: n.name,
        type: n.type,
        page: page.name,
        section: section ? section.name : undefined,
        width: size.width,
        height: size.height,
      })
    );
  };
  for (const page of pages) {
    for (const n of page.children) {
      if (n.type === 'SECTION') {
        for (const c of n.children || []) take(c, page, n);
      } else {
        take(n, page, null);
      }
    }
  }
  return { count: screens.length, screens };
}

/**
 * PNG export. With `maxEdge` the scale shrinks until the longest side fits, so
 * a 1440×3200 page arrives at a size a vision model reads without resampling.
 */
async function cmdPng(args) {
  const node = await getNode(args.id);
  const bb = node.absoluteBoundingBox || { width: 0, height: 0 };
  const requestedScale = clamp(Number(args.scale) || 2, 0.01, 4);
  const maxEdge = Number(args.maxEdge) > 0 ? Number(args.maxEdge) : undefined;
  const longest = Math.max(bb.width, bb.height);
  let scale = requestedScale;
  if (maxEdge && longest > 0) scale = clamp(Math.min(requestedScale, maxEdge / longest), 0.01, 4);
  const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
  return compact({
    id: node.id,
    name: node.name,
    type: node.type,
    scale,
    requestedScale,
    maxEdge,
    width: Math.round(bb.width * scale),
    height: Math.round(bb.height * scale),
    sourceWidth: Math.round(bb.width),
    sourceHeight: Math.round(bb.height),
    // Enough for a client to zoom into a section of a screen too tall to read.
    children: Array.isArray(node.children) ? node.children.slice(0, 40).map(brief) : undefined,
    bytes: bytes.length,
    base64: figma.base64Encode(bytes),
  });
}

async function cmdText(args) {
  const root = await getNode(args.id);
  const out = [];
  const take = (n) => {
    if (n.type === 'TEXT') out.push({ id: n.id, name: n.name, characters: n.characters, style: compact(typeStyle(n)) });
  };
  take(root);
  walk(root, take);
  return { id: root.id, name: root.name, count: out.length, texts: out };
}

async function run(cmd, args) {
  switch (cmd) {
    case 'ping':
      return {
        file: figma.root.name,
        page: { id: figma.currentPage.id, name: figma.currentPage.name },
        pages: figma.root.children.length,
        editorType: figma.editorType,
        selection: figma.currentPage.selection.map(brief),
        protocol: PROTOCOL,
      };

    case 'pages':
      // Page stubs carry id and name without being loaded; `childCount` needed
      // `children`, and that is what made listing pages as expensive as
      // reading the whole document.
      return {
        file: figma.root.name,
        pages: figma.root.children.map((p) => ({ id: p.id, name: p.name })),
      };

    case 'index': {
      const [page] = await getPages(args.page);
      return { page: { id: page.id, name: page.name }, nodes: page.children.map(summary) };
    }

    case 'find':
      return cmdFind(args);

    case 'screens':
      return cmdScreens(args);

    case 'node': {
      const depth = clamp(Number(args.depth) || 5, 1, 30);
      const ids = String(args.id || '')
        .split(/[,\s]+/)
        .filter(Boolean);
      if (!ids.length) throw new Error('`node` needs at least one id.');
      const nodes = {};
      for (const id of ids) {
        const hit = await getNode(id);
        nodes[hit.id] = { document: serialize(hit, depth) };
      }
      return { name: figma.root.name, nodes };
    }

    case 'selection': {
      const depth = clamp(Number(args.depth) || 5, 1, 30);
      const picked = figma.currentPage.selection;
      if (!picked.length) throw new Error('Nothing is selected in Figma.');
      const nodes = {};
      for (const n of picked) nodes[n.id] = { document: serialize(n, depth) };
      return { name: figma.root.name, nodes };
    }

    case 'sets':
      return cmdCollect(args, 'COMPONENT_SET');

    case 'components':
      return cmdCollect(args, 'COMPONENT');

    case 'variables':
      return cmdVariables();

    case 'styles':
      return cmdStyles();

    case 'css': {
      const node = await getNode(args.id);
      if (typeof node.getCSSAsync !== 'function') throw new Error(`${node.type} nodes have no CSS.`);
      return { id: node.id, name: node.name, type: node.type, css: await node.getCSSAsync() };
    }

    case 'text':
      return cmdText(args);

    case 'svg': {
      const node = await getNode(args.id);
      const svg = await node.exportAsync({
        format: 'SVG_STRING',
        svgOutlineText: !!args.outlineText,
        svgIdAttribute: false,
        svgSimplifyStroke: true,
      });
      return { id: node.id, name: node.name, svg };
    }

    case 'png':
      return cmdPng(args);

    case 'select': {
      const node = await getNode(args.id);
      let page = node;
      while (page && page.type !== 'PAGE') page = page.parent;
      if (!page) throw new Error(`${node.name} is not on a page.`);
      if (page.id !== figma.currentPage.id) await figma.setCurrentPageAsync(page);
      figma.currentPage.selection = [node];
      figma.viewport.scrollAndZoomIntoView([node]);
      return { id: node.id, name: node.name, page: page.name };
    }

    default:
      throw new Error(`Unknown command \`${cmd}\`.`);
  }
}

// ------------------------------------------------------------------ plumbing

figma.showUI(__html__, { width: 340, height: 430, themeColors: true });

function pushStatus() {
  figma.ui.postMessage({
    type: 'status',
    file: figma.root.name,
    page: figma.currentPage.name,
    selection: figma.currentPage.selection.length,
  });
}

figma.on('selectionchange', pushStatus);
figma.on('currentpagechange', pushStatus);
pushStatus();

// Answers are stringified here, in the sandbox, and handed over in slices: the
// iframe then forwards each slice untouched, so neither side ever holds a
// second copy of a multi-megabyte dump.
const CHUNK = 3 * 1024 * 1024;

figma.ui.onmessage = async (msg) => {
  if (!msg || msg.type !== 'run') return;
  const started = Date.now();
  try {
    const data = await run(msg.cmd, msg.args || {});
    const text = JSON.stringify(data === undefined ? null : data);
    const total = Math.max(1, Math.ceil(text.length / CHUNK));
    for (let i = 0; i < total; i++) {
      figma.ui.postMessage({
        type: 'chunk',
        id: msg.id,
        seq: i,
        final: i === total - 1,
        chunk: text.slice(i * CHUNK, (i + 1) * CHUNK),
        bytes: i === total - 1 ? text.length : undefined,
        ms: i === total - 1 ? Date.now() - started : undefined,
      });
    }
  } catch (err) {
    figma.ui.postMessage({
      type: 'failed',
      id: msg.id,
      error: String(err && err.message ? err.message : err),
    });
  }
};
