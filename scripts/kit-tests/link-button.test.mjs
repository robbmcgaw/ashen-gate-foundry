import test from 'node:test';
import assert from 'node:assert/strict';
import {HTML} from './kit-path.mjs';
const {linkButton} = await import(HTML);

test('linkButton is a type="button" with the ag-link class and escaped text and data', () => {
  assert.equal(linkButton('Open in Locations', {data: {action: 'openLocation', id: 'LOC-TEST-1'}}),
    '<button type="button" class="ag-link" data-action="openLocation" data-id="LOC-TEST-1">Open in Locations</button>');
  assert.equal(linkButton('<b>"x"</b>'), '<button type="button" class="ag-link">&lt;b&gt;&quot;x&quot;&lt;/b&gt;</button>');
});

test('linkButton: optional icon, aria-label and tooltip; data-* skips empty values', () => {
  const html = linkButton('GM Setup', {icon: 'fa-solid fa-gear', ariaLabel: 'Go to GM Setup', tooltip: 'Open the GM Setup tab', data: {tab: 'gm', skip: undefined, off: false, on: true}});
  assert.equal(html, '<button type="button" class="ag-link" data-tab="gm" data-on="" aria-label="Go to GM Setup" data-tooltip="Open the GM Setup tab"><i class="fa-solid fa-gear" aria-hidden="true"></i> GM Setup</button>');
  assert.ok(!/\stitle=/.test(html), 'tooltips use data-tooltip, never title');
});
