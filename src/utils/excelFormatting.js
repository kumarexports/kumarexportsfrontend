import * as XLSX from 'xlsx'

export const applyExcelTableStyle = (worksheet, headerCount, rows, options = {}) => {
  const headerEnd = XLSX.utils.encode_col(Math.max(0, headerCount - 1))
  const totalRows = Math.max(1, rows + 1)
  const range = `A1:${headerEnd}${totalRows}`

  worksheet['!autofilter'] = { ref: range }
  worksheet['!freeze'] = { xSplit: 0, ySplit: 1 }

  const widths = options.widths || []
  if (widths.length) {
    worksheet['!cols'] = widths.map((width) => ({ wch: width }))
  }

  const headerStyle = {
    fill: { patternType: 'solid', fgColor: { rgb: options.headerFill || '1E56A0' } },
    font: { bold: true, color: { rgb: options.headerFont || 'FFFFFF' }, sz: 11 },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: '1E56A0' } },
      bottom: { style: 'thin', color: { rgb: '1E56A0' } },
      left: { style: 'thin', color: { rgb: '1E56A0' } },
      right: { style: 'thin', color: { rgb: '1E56A0' } },
    },
  }

  const bodyStyle = {
    alignment: { vertical: 'center', wrapText: true },
    border: {
      top: { style: 'thin', color: { rgb: 'DCE7F4' } },
      bottom: { style: 'thin', color: { rgb: 'DCE7F4' } },
      left: { style: 'thin', color: { rgb: 'DCE7F4' } },
      right: { style: 'thin', color: { rgb: 'DCE7F4' } },
    },
  }

  for (let row = 1; row <= rows + 1; row += 1) {
    for (let col = 0; col < headerCount; col += 1) {
      const address = `${XLSX.utils.encode_col(col)}${row}`
      if (!worksheet[address]) continue
      worksheet[address].s = row === 1 ? headerStyle : bodyStyle
    }
  }
}
