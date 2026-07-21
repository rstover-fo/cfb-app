'use client'

import Papa from 'papaparse'

/**
 * Slugify a string for use in filenames
 * Converts to lowercase, replaces spaces with hyphens, removes special characters
 */
function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Export data to CSV and trigger browser download
 * @param filename - Base filename (without extension, will be slugified)
 * @param rows - Array of objects to export
 *
 * Features:
 * - Uses PapaParse for robust CSV generation
 * - Prepends UTF-8 BOM for Excel compatibility
 * - Slugifies filename for safety
 * - Automatically adds .csv extension
 * - Triggers download via anchor element
 */
export function exportToCsv(
  filename: string,
  rows: Record<string, unknown>[],
): void {
  if (rows.length === 0) {
    return
  }

  try {
    // Unparse data to CSV using PapaParse
    const csv = Papa.unparse(rows)

    // Add UTF-8 BOM for Excel compatibility
    const BOM = '﻿'
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' })

    // Slugify filename and add extension
    const slugifiedName = slugify(filename)
    const finalFilename = `${slugifiedName}.csv`

    // Trigger download via anchor element
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = finalFilename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (error) {
    throw new Error(`Failed to export CSV: ${error instanceof Error ? error.message : String(error)}`)
  }
}
