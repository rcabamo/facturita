use printpdf::{
    BuiltinFont, Line, LinePoint, Mm, Op, PdfDocument, PdfFontHandle, PdfPage, PdfSaveOptions,
    Point, Pt, TextItem,
};

use crate::models::{InvoiceData, InvoiceLine};

const PAGE_W: f32 = 210.0;
const PAGE_H: f32 = 297.0;
const MARGIN: f32 = 18.0;
const RIGHT: f32 = PAGE_W - MARGIN;

fn from_top(y: f32) -> Mm {
    Mm(PAGE_H - y)
}

fn text(x: f32, y: f32, size: f32, bold: bool, content: &str) -> Vec<Op> {
    let font = if bold {
        BuiltinFont::HelveticaBold
    } else {
        BuiltinFont::Helvetica
    };
    vec![
        Op::StartTextSection,
        Op::SetFont {
            font: PdfFontHandle::Builtin(font),
            size: Pt(size),
        },
        Op::SetTextCursor {
            pos: Point::new(Mm(x), from_top(y)),
        },
        Op::ShowText {
            items: vec![TextItem::Text(content.to_string())],
        },
        Op::EndTextSection,
    ]
}

fn hline(y: f32) -> Op {
    Op::DrawLine {
        line: Line {
            points: vec![
                LinePoint {
                    p: Point::new(Mm(MARGIN), from_top(y)),
                    bezier: false,
                },
                LinePoint {
                    p: Point::new(Mm(RIGHT), from_top(y)),
                    bezier: false,
                },
            ],
            is_closed: false,
        },
    }
}

fn money(value: f64, symbol: &str) -> String {
    format!("{value:.2}").replace('.', ",") + " " + symbol
}

fn short_date(ts: &str) -> String {
    let day = ts.get(0..10).unwrap_or(ts);
    let mut parts = day.split('-');
    match (parts.next(), parts.next(), parts.next()) {
        (Some(y), Some(m), Some(d)) => format!("{d}/{m}/{y}"),
        _ => day.to_string(),
    }
}

fn concept(line: &InvoiceLine) -> String {
    let title = if line.concept.trim().is_empty() {
        "Clase"
    } else {
        line.concept.trim()
    };
    title.to_string()
}

fn line_ops(ops: &mut Vec<Op>, y: &mut f32, line: &InvoiceLine, currency: &str) {
    let duration = line
        .duration_min
        .map(|d| format!("{d} min"))
        .unwrap_or_else(|| "—".to_string());
    ops.extend(text(MARGIN, *y, 9.5, false, &short_date(&line.date)));
    ops.extend(text(MARGIN + 26.0, *y, 9.5, false, &concept(line)));
    ops.extend(text(118.0, *y, 9.5, false, &duration));
    ops.extend(text(140.0, *y, 9.5, false, &money(line.rate, currency)));
    ops.extend(text(168.0, *y, 9.5, false, &money(line.amount, currency)));
    *y += 6.0;
}

/// Genera el PDF de una factura a partir de sus datos. Fuentes estándar
/// (Helvetica + WinAnsi), por lo que soporta acentos y el símbolo del euro.
pub fn render(data: &InvoiceData) -> Result<Vec<u8>, String> {
    let mut ops: Vec<Op> = Vec::new();
    let mut y = 24.0;

    ops.extend(text(MARGIN, y, 20.0, true, "FACTURA"));
    ops.extend(text(
        RIGHT - 52.0,
        y,
        13.0,
        true,
        &format!("Nº {}", data.number),
    ));
    y += 8.0;
    ops.extend(text(
        RIGHT - 52.0,
        y,
        9.5,
        false,
        &format!("Fecha: {}", short_date(&data.issued_on)),
    ));
    y += 16.0;

    ops.extend(text(MARGIN, y, 11.5, true, &data.issuer.name));
    y += 5.5;
    if !data.issuer.tax_id.trim().is_empty() {
        ops.extend(text(
            MARGIN,
            y,
            9.5,
            false,
            &format!("NIF: {}", data.issuer.tax_id.trim()),
        ));
        y += 5.0;
    }
    if !data.issuer.address.trim().is_empty() {
        ops.extend(text(MARGIN, y, 9.5, false, data.issuer.address.trim()));
        y += 5.0;
    }
    if !data.issuer.email.trim().is_empty() {
        ops.extend(text(MARGIN, y, 9.5, false, data.issuer.email.trim()));
        y += 5.0;
    }
    if let Some(phone) = data.issuer.phone.as_deref() {
        if !phone.trim().is_empty() {
            ops.extend(text(MARGIN, y, 9.5, false, phone.trim()));
            y += 5.0;
        }
    }

    y += 6.0;
    ops.extend(text(MARGIN, y, 10.5, true, "Cliente"));
    y += 5.5;
    ops.extend(text(MARGIN, y, 9.5, false, &data.client.name));
    y += 5.0;
    ops.extend(text(MARGIN, y, 9.5, false, &data.client.email));
    y += 5.0;
    if let Some(tax_id) = data.client.tax_id.as_deref() {
        if !tax_id.trim().is_empty() {
            ops.extend(text(
                MARGIN,
                y,
                9.5,
                false,
                &format!("NIF: {}", tax_id.trim()),
            ));
            y += 5.0;
        }
    }

    y += 4.0;
    ops.extend(text(
        MARGIN,
        y,
        9.5,
        true,
        &format!("Periodo facturado: {}", data.period),
    ));
    y += 8.0;
    ops.push(hline(y));
    y += 6.0;

    ops.extend(text(MARGIN, y, 9.5, true, "Fecha"));
    ops.extend(text(MARGIN + 26.0, y, 9.5, true, "Concepto"));
    ops.extend(text(118.0, y, 9.5, true, "Duración"));
    ops.extend(text(140.0, y, 9.5, true, "Tarifa"));
    ops.extend(text(168.0, y, 9.5, true, "Importe"));
    y += 3.0;
    ops.push(hline(y));
    y += 6.0;

    if data.lines.is_empty() {
        ops.extend(text(MARGIN, y, 9.5, false, "Sin clases en el periodo."));
        y += 6.0;
    } else {
        for line in &data.lines {
            line_ops(&mut ops, &mut y, line, &data.currency);
        }
    }

    y += 1.0;
    ops.push(hline(y));
    y += 7.0;
    ops.extend(text(
        140.0,
        y,
        11.0,
        true,
        &format!("Total: {}", money(data.total, &data.currency)),
    ));

    y += 14.0;
    ops.extend(text(
        MARGIN,
        y,
        8.5,
        false,
        "Sin IVA (operación no sujeta / exenta). Gracias por su confianza.",
    ));

    let page = PdfPage::new(Mm(PAGE_W), Mm(PAGE_H), ops);
    let mut doc = PdfDocument::new(&format!("Factura {}", data.number));
    let mut warnings = Vec::new();
    let bytes = doc
        .with_pages(vec![page])
        .save(&PdfSaveOptions::default(), &mut warnings);
    if bytes.starts_with(b"%PDF") {
        Ok(bytes)
    } else {
        Err("No se pudo generar el PDF.".to_string())
    }
}
