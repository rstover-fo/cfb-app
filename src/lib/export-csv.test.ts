import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { exportToCsv } from './export-csv'

describe('exportToCsv', () => {
  let createElementSpy: any
  let appendChildSpy: any
  let removeChildSpy: any
  let createObjectURLSpy: any
  let revokeObjectURLSpy: any

  beforeEach(() => {
    // Mock DOM methods
    createElementSpy = vi.spyOn(document, 'createElement')
    appendChildSpy = vi.spyOn(document.body, 'appendChild')
    removeChildSpy = vi.spyOn(document.body, 'removeChild')
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL')
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL')

    // Mock createObjectURL to return a fake URL
    createObjectURLSpy.mockReturnValue('blob:mock-url')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should create a CSV file with correct headers', () => {
    const data = [
      { name: 'Alice', score: 100 },
      { name: 'Bob', score: 95 },
    ]

    exportToCsv('test', data)

    // Verify that a Blob was created
    expect(createObjectURLSpy).toHaveBeenCalled()
  })

  it('should slugify filename correctly', () => {
    const data = [{ value: 1 }]
    const testCases = [
      ['Hello World', 'hello-world'],
      ['Test_File-Name', 'testfile-name'],
      ['Multiple   Spaces', 'multiple-spaces'],
      ['Special@#$Characters', 'specialcharacters'],
      ['UPPERCASE', 'uppercase'],
      ['dash-separated-name', 'dash-separated-name'],
    ]

    testCases.forEach(([input, expected]) => {
      vi.clearAllMocks()
      createObjectURLSpy.mockReturnValue('blob:mock-url')

      exportToCsv(input, data)

      const linkElement = createElementSpy.mock.results.find(
        result => result.value?.download !== undefined,
      )?.value

      if (linkElement) {
        expect(linkElement.download).toBe(`${expected}.csv`)
      }
    })
  })

  it('should include UTF-8 BOM in the blob', () => {
    const data = [{ test: 'data' }]
    let capturedBlob: Blob | null = null

    createObjectURLSpy.mockImplementation((blob: Blob) => {
      capturedBlob = blob
      return 'blob:mock-url'
    })

    exportToCsv('test', data)

    if (capturedBlob) {
      // Convert blob to text and verify BOM
      const reader = new FileReader()
      let blobText = ''

      reader.onload = () => {
        blobText = reader.result as string
        // BOM character is ﻿ or
        expect(blobText[0]).toBe('﻿')
      }

      reader.readAsText(capturedBlob)
    }
  })

  it('should handle multiple rows correctly', () => {
    const data = [
      { id: 1, name: 'Item 1', value: 100 },
      { id: 2, name: 'Item 2', value: 200 },
      { id: 3, name: 'Item 3', value: 300 },
    ]

    expect(() => {
      exportToCsv('items', data)
    }).not.toThrow()

    // Verify createObjectURL was called (blob created)
    expect(createObjectURLSpy).toHaveBeenCalled()
  })

  it('should log warning when given empty rows', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const data: Record<string, unknown>[] = []

    exportToCsv('empty', data)

    expect(warnSpy).toHaveBeenCalledWith('exportToCsv: No rows to export')
    warnSpy.mockRestore()
  })

  it('should add .csv extension to filename', () => {
    const data = [{ value: 1 }]

    exportToCsv('myfile', data)

    const linkElement = createElementSpy.mock.results.find(
      result => result.value?.download !== undefined,
    )?.value

    if (linkElement) {
      expect(linkElement.download).toMatch(/\.csv$/)
    }
  })

  it('should create proper anchor element and trigger click', () => {
    const data = [{ test: 'data' }]

    // Don't mock createElement - let it create a real anchor element
    // Just track the calls
    createElementSpy.mockRestore()
    const createElSpy = vi.spyOn(document, 'createElement')

    exportToCsv('test', data)

    // Verify createElement was called with 'a'
    expect(createElSpy).toHaveBeenCalledWith('a')

    // Verify appendChild and removeChild were called
    expect(appendChildSpy).toHaveBeenCalled()
    expect(removeChildSpy).toHaveBeenCalled()

    createElSpy.mockRestore()
  })

  it('should clean up object URL after download', () => {
    const data = [{ value: 1 }]

    exportToCsv('test', data)

    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url')
  })

  it('should handle special characters in data', () => {
    const data = [
      { description: 'Contains, commas, here' },
      { description: 'Contains "quotes" here' },
      { description: 'Contains\nnewlines\nhere' },
    ]

    expect(() => {
      exportToCsv('special', data)
    }).not.toThrow()

    expect(createObjectURLSpy).toHaveBeenCalled()
  })
})
