import { test } from 'node:test'
import assert from 'node:assert/strict'
import { bestGrid, sideColumnWidth } from './meeting-grid.ts'

const fits = (grid, count, width, height, gap) => {
  assert.ok(grid.columns * grid.rows >= count)
  assert.ok(grid.columns * grid.tileWidth + (grid.columns - 1) * gap <= width)
  assert.ok(grid.rows * grid.tileHeight + (grid.rows - 1) * gap <= height)
}

test('one person gets one large tile', () => {
  const grid = bestGrid(1, 1400, 700, 12)
  assert.equal(grid.columns, 1)
  assert.equal(grid.rows, 1)
  assert.equal(grid.tileHeight, 700)
  assert.equal(grid.tileWidth, Math.floor(700 * 16 / 9))
})

test('two people sit side by side on a wide screen', () => {
  const grid = bestGrid(2, 1400, 700, 12)
  assert.deepEqual([grid.columns, grid.rows], [2, 1])
  fits(grid, 2, 1400, 700, 12)
})

test('three people make two on top and one below on a laptop screen', () => {
  const grid = bestGrid(3, 1400, 700, 12)
  assert.deepEqual([grid.columns, grid.rows], [2, 2])
  fits(grid, 3, 1400, 700, 12)
})

test('five people make three on top and two below', () => {
  const grid = bestGrid(5, 1400, 700, 12)
  assert.deepEqual([grid.columns, grid.rows], [3, 2])
  fits(grid, 5, 1400, 700, 12)
})

test('nine people make a three by three grid', () => {
  const grid = bestGrid(9, 1400, 700, 12)
  assert.deepEqual([grid.columns, grid.rows], [3, 3])
  fits(grid, 9, 1400, 700, 12)
})

test('a tall phone screen stacks people in one column', () => {
  const grid = bestGrid(3, 360, 640, 8)
  assert.deepEqual([grid.columns, grid.rows], [1, 3])
  fits(grid, 3, 360, 640, 8)
})

test('the chosen grid is never smaller than any other column count', () => {
  for (const [width, height] of [[1400, 700], [1200, 500], [360, 640], [700, 700], [2000, 400]]) {
    for (let count = 1; count <= 16; count++) {
      const grid = bestGrid(count, width, height, 10)
      fits(grid, count, width, height, 10)
      for (let columns = 1; columns <= count; columns++) {
        const rows = Math.ceil(count / columns)
        const other = Math.min((width - (columns - 1) * 10) / columns, (height - (rows - 1) * 10) / rows * 16 / 9)
        assert.ok(grid.tileWidth >= Math.floor(other) - 1, `${count} people in ${width}x${height}: ${columns} columns would be larger`)
      }
    }
  }
})

test('ties keep fewer columns so the last row is not left almost empty', () => {
  const grid = bestGrid(5, 3000, 400, 10)
  assert.equal(grid.rows, 1)
  // Three and four columns both give two rows of the same height-limited size: 3 + 2 beats 4 + 1.
  assert.deepEqual(bestGrid(5, 1500, 381, 10), { columns: 3, rows: 2, tileWidth: 329, tileHeight: 185 })
})

test('tiles keep the 16:9 shape', () => {
  const grid = bestGrid(4, 1000, 900, 12)
  assert.ok(Math.abs(grid.tileWidth / grid.tileHeight - 16 / 9) < 0.02)
})

test('nothing to lay out or no room gives empty tiles', () => {
  assert.deepEqual(bestGrid(0, 1000, 600, 12), { columns: 0, rows: 0, tileWidth: 0, tileHeight: 0 })
  const grid = bestGrid(3, 0, 0, 12)
  assert.equal(grid.tileWidth, 0)
  assert.equal(grid.tileHeight, 0)
  assert.ok(grid.columns >= 1)
})

test('the side column narrows until every person fits', () => {
  // Four people in 700px of height fit at about 300px wide, under the 25% cap.
  const width = sideColumnWidth(4, 1400, 700, 8)
  assert.ok(width <= 350)
  assert.ok(4 * width * 9 / 16 + 3 * 8 <= 700)
  // Two people fit at the full 25% width.
  assert.equal(sideColumnWidth(2, 1400, 700, 8), 350)
  // Too many people: the column keeps a readable width and scrolls.
  assert.equal(sideColumnWidth(12, 1400, 500, 8), 160)
})

test('the side column never exceeds a quarter of a wide screen', () => {
  assert.equal(sideColumnWidth(1, 2000, 900, 8), 500)
  assert.equal(sideColumnWidth(1, 800, 900, 8), 220)
})
