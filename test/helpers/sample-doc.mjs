// @ts-check
// One small document that exercises every serializer branch and every kind of
// screen placement: on the page, inside a section, and things that are not
// screens at all (a group, a loose rectangle).

import { MIXED, bbox } from './figma-stub.mjs';

const solid = (r, g, b, opacity) => ({ type: 'SOLID', blendMode: 'NORMAL', color: { r, g, b }, opacity });

export function sampleDoc() {
  return {
    file: 'Sample file',
    pages: [
      {
        id: '1:0',
        name: 'Screens',
        children: [
          {
            id: '1:1',
            name: 'Home',
            type: 'FRAME',
            ...bbox(0, 0, 1440, 3200),
            visible: true,
            opacity: 1,
            rotation: 0,
            blendMode: 'PASS_THROUGH',
            clipsContent: true,
            layoutMode: 'VERTICAL',
            layoutWrap: 'NO_WRAP',
            primaryAxisAlignItems: 'MIN',
            counterAxisAlignItems: 'CENTER',
            primaryAxisSizingMode: 'AUTO',
            counterAxisSizingMode: 'FIXED',
            paddingLeft: 24,
            paddingRight: 24,
            paddingTop: 32,
            paddingBottom: 32,
            itemSpacing: 16,
            cornerRadius: MIXED,
            topLeftRadius: 8,
            topRightRadius: 8,
            bottomRightRadius: 0,
            bottomLeftRadius: 0,
            fills: [
              solid(1, 1, 1, 0.5),
              {
                type: 'GRADIENT_LINEAR',
                blendMode: 'NORMAL',
                gradientTransform: [
                  [1, 0, 0],
                  [0, 1, 0],
                ],
                gradientStops: [
                  { position: 0, color: { r: 0, g: 0, b: 0, a: 1 } },
                  { position: 1, color: { r: 1, g: 1, b: 1, a: 0 } },
                ],
              },
            ],
            strokes: [solid(0.2, 0.4, 0.6, 1)],
            strokeWeight: MIXED,
            strokeTopWeight: 0,
            strokeRightWeight: 0,
            strokeBottomWeight: 2,
            strokeLeftWeight: 0,
            strokeAlign: 'INSIDE',
            dashPattern: [],
            effects: [
              {
                type: 'DROP_SHADOW',
                visible: true,
                radius: 12,
                spread: 0,
                blendMode: 'NORMAL',
                color: { r: 0, g: 0, b: 0, a: 0.25 },
                offset: { x: 0, y: 4 },
              },
            ],
            children: [
              {
                id: '1:2',
                name: 'Title',
                type: 'TEXT',
                ...bbox(24, 32, 400, 40),
                characters: 'Welcome',
                fontName: { family: 'Inter', style: 'Semi Bold' },
                fontWeight: 600,
                fontSize: 32,
                textAlignHorizontal: 'LEFT',
                textAlignVertical: 'TOP',
                textCase: 'ORIGINAL',
                textDecoration: 'NONE',
                letterSpacing: { unit: 'PERCENT', value: -2 },
                lineHeight: { unit: 'PIXELS', value: 40 },
                fills: [solid(0, 0, 0, 1)],
              },
              {
                id: '1:3',
                name: 'Mixed copy',
                type: 'TEXT',
                ...bbox(24, 88, 400, 20),
                characters: 'Small and big',
                fontName: { family: 'Inter', style: 'Regular' },
                fontWeight: 400,
                fontSize: MIXED,
                textAlignHorizontal: 'LEFT',
                textAlignVertical: 'TOP',
                textCase: 'ORIGINAL',
                textDecoration: 'NONE',
                letterSpacing: { unit: 'PIXELS', value: 0 },
                lineHeight: { unit: 'AUTO' },
              },
            ],
          },
          {
            id: '1:10',
            name: 'Flows',
            type: 'SECTION',
            ...bbox(2000, 0, 1200, 900),
            children: [
              { id: '1:11', name: 'Login', type: 'FRAME', ...bbox(2040, 40, 375, 812), children: [] },
              { id: '1:12', name: 'Card', type: 'INSTANCE', ...bbox(2500, 40, 320, 200), children: [] },
              { id: '1:13', name: 'Note', type: 'TEXT', ...bbox(2900, 40, 100, 20), characters: 'wip' },
            ],
          },
          { id: '1:20', name: 'Loose group', type: 'GROUP', ...bbox(0, 4000, 100, 100), children: [] },
          { id: '1:21', name: 'Loose rect', type: 'RECTANGLE', ...bbox(200, 4000, 100, 100) },
        ],
      },
      {
        id: '2:0',
        name: 'Settings page',
        children: [
          { id: '2:1', name: 'Settings', type: 'FRAME', ...bbox(0, 0, 1280, 720), children: [] },
          {
            id: '2:2',
            name: 'Button',
            type: 'COMPONENT_SET',
            ...bbox(0, 800, 200, 100),
            componentPropertyDefinitions: { Size: { type: 'VARIANT', defaultValue: 'md', variantOptions: ['sm', 'md'] } },
            children: [
              { id: '2:3', name: 'Size=sm', type: 'COMPONENT', key: 'k-sm', ...bbox(0, 800, 80, 32) },
              { id: '2:4', name: 'Size=md', type: 'COMPONENT', key: 'k-md', ...bbox(100, 800, 96, 40) },
            ],
          },
        ],
      },
    ],
  };
}
