const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');

function generarBitacoraPDF(bitacora, checklist, registros, cierre, outputPath) {

  const doc = new PDFDocument({ margin: 40 });
  doc.pipe(fs.createWriteStream(outputPath));

  /* ===========================
     HEADER
  ============================ */

  doc
    .fontSize(20)
    .fillColor('#0f1c3f')
    .text('BITÁCORA CALDERA', { align: 'center' })
    .moveDown(1);

  doc
    .fontSize(12)
    .fillColor('#000000');

  doc.text(`Nombre: ${bitacora.operador}`);
  doc.text(`Rol: OPERADOR`);
  doc.text(`Turno: ${bitacora.turno}`);
  doc.text(`N° Turno: ${bitacora.turnoNumero}`);
  doc.text(`Fecha Inicio: ${new Date(bitacora.fechaInicio).toLocaleString()}`);
  doc.text(`Fecha Cierre: ${bitacora.fechaCierre ? new Date(bitacora.fechaCierre).toLocaleString() : '-'}`);

  doc.moveDown(2);

  /* ===========================
     CHECKLIST INICIAL
  ============================ */

  doc
    .fontSize(16)
    .text('Checklist Inicial', { underline: true })
    .moveDown(1);

  const checklistItems = [
    ['Condición Equipo', checklist.condicionEquipo],
    ['Caldera Hurst', checklist.calderaHurst],
    ['Bomba Alimentación Agua', checklist.bombaAlimentacionAgua],
    ['Bomba Petróleo', checklist.bombaPetroleo],
    ['Purga Superficie', checklist.purgaSuperficie],
    ['Bomba Dosificadora', checklist.bombaDosificadoraQuimicos],
    ['Tren de Gas', checklist.trenGas],
    ['Ablandadores', checklist.ablandadores],
    ['Nivel Agua', checklist.nivelAguaTuboNivel]
  ];

  checklistItems.forEach(item => {
    doc.fontSize(11).text(`${item[0]}: ${item[1]}`);
  });

  doc.moveDown(2);

  /* ===========================
     REGISTRO OPERACIÓN
  ============================ */

  doc
    .fontSize(16)
    .text('Registro de Operación', { underline: true })
    .moveDown(1);

  // Encabezado tabla
  doc
    .fontSize(10)
    .text('Hora', 40)
    .text('Presión', 90)
    .text('Temp', 150)
    .text('Nivel TK %', 200)
    .text('Consumo m3/h', 270)
    .text('Observaciones', 350);

  doc.moveDown(0.5);

  registros.forEach(reg => {
    doc
      .fontSize(9)
      .text(reg.hora || '-', 40)
      .text(reg.presionCaldera || '-', 90)
      .text(reg.temperaturaITC || '-', 150)
      .text(reg.nivelTkCombustible || '-', 200)
      .text(reg.consumoCombustible || '-', 270)
      .text(reg.observaciones || '-', 350);
  });

  doc.moveDown(2);

  /* ===========================
     CIERRE
  ============================ */

  doc
    .fontSize(16)
    .text('Cierre de Turno', { underline: true })
    .moveDown(1);

  doc.fontSize(11).text(`Observaciones: ${cierre?.observaciones || '-'}`);

  doc.moveDown(3);

  /* ===========================
     FIRMA
  ============================ */

  if (cierre?.firmaOperador) {
    const firmaPath = path.resolve(cierre.firmaOperador);

    if (fs.existsSync(firmaPath)) {
      doc.image(firmaPath, {
        fit: [200, 80],
        align: 'left'
      });
    }
  }

  doc.moveDown(1);
  doc.text('____________________________');
  doc.text('Firma Operador');

  doc.end();
}

module.exports = generarBitacoraPDF;
