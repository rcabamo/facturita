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

fn money(value: f64, symbol: &str, lang: &str) -> String {
    if lang.eq_ignore_ascii_case("en") {
        format!("{}{value:.2}", symbol)
    } else {
        format!("{value:.2}").replace('.', ",") + " " + symbol
    }
}

fn short_date(ts: &str, lang: &str) -> String {
    let day = ts.get(0..10).unwrap_or(ts);
    if lang.eq_ignore_ascii_case("en") {
        return day.to_string();
    }
    let mut parts = day.split('-');
    match (parts.next(), parts.next(), parts.next()) {
        (Some(y), Some(m), Some(d)) => format!("{d}/{m}/{y}"),
        _ => day.to_string(),
    }
}

/// Textos del PDF en el idioma del cliente.
struct Labels {
    title: &'static str,
    number: &'static str,
    date: &'static str,
    tax_id: &'static str,
    bank_account: &'static str,
    client: &'static str,
    period: &'static str,
    col_date: &'static str,
    col_concept: &'static str,
    col_duration: &'static str,
    col_rate: &'static str,
    col_amount: &'static str,
    empty: &'static str,
    total: &'static str,
    footer: &'static str,
    doc_title: &'static str,
    default_concept: &'static str,
}

fn labels(lang: &str) -> Labels {
    if lang.eq_ignore_ascii_case("en") {
        Labels {
            title: "INVOICE",
            number: "No.",
            date: "Date",
            tax_id: "VAT",
            bank_account: "Bank account",
            client: "Client",
            period: "Billing period",
            col_date: "Date",
            col_concept: "Description",
            col_duration: "Duration",
            col_rate: "Rate",
            col_amount: "Amount",
            empty: "No classes in this period.",
            total: "Total",
            footer: "No VAT (exempt / out of scope). Thank you for your business.",
            doc_title: "Invoice",
            default_concept: "Class",
        }
    } else {
        Labels {
            title: "FACTURA",
            number: "Nº",
            date: "Fecha",
            tax_id: "NIF",
            bank_account: "Cuenta de ingreso",
            client: "Cliente",
            period: "Periodo facturado",
            col_date: "Fecha",
            col_concept: "Concepto",
            col_duration: "Duración",
            col_rate: "Tarifa",
            col_amount: "Importe",
            empty: "Sin clases en el periodo.",
            total: "Total",
            footer: "Sin IVA (operación no sujeta / exenta). Gracias por su confianza.",
            doc_title: "Factura",
            default_concept: "Clase",
        }
    }
}

fn concept(line: &InvoiceLine, lang: &str) -> String {
    let title = if line.concept.trim().is_empty() {
        labels(lang).default_concept
    } else {
        line.concept.trim()
    };
    title.to_string()
}

fn line_ops(ops: &mut Vec<Op>, y: &mut f32, line: &InvoiceLine, data: &InvoiceData) {
    let lang = data.lang.as_str();
    let duration = line
        .duration_min
        .map(|d| format!("{d} min"))
        .unwrap_or_else(|| "—".to_string());
    ops.extend(text(MARGIN, *y, 9.5, false, &short_date(&line.date, lang)));
    ops.extend(text(MARGIN + 26.0, *y, 9.5, false, &concept(line, lang)));
    ops.extend(text(118.0, *y, 9.5, false, &duration));
    ops.extend(text(
        140.0,
        *y,
        9.5,
        false,
        &money(line.rate, &data.currency, lang),
    ));
    ops.extend(text(
        168.0,
        *y,
        9.5,
        false,
        &money(line.amount, &data.currency, lang),
    ));
    *y += 6.0;
}

/// Genera el PDF de una factura a partir de sus datos. Fuentes estándar
/// (Helvetica + WinAnsi), por lo que soporta acentos y el símbolo del euro.
pub fn render(data: &InvoiceData) -> Result<Vec<u8>, String> {
    let lang = data.lang.as_str();
    let l = labels(lang);
    let mut ops: Vec<Op> = Vec::new();
    let mut y = 24.0;

    ops.extend(text(MARGIN, y, 20.0, true, l.title));
    ops.extend(text(
        RIGHT - 52.0,
        y,
        13.0,
        true,
        &format!("{} {}", l.number, data.number),
    ));
    y += 8.0;
    ops.extend(text(
        RIGHT - 52.0,
        y,
        9.5,
        false,
        &format!("{}: {}", l.date, short_date(&data.issued_on, lang)),
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
            &format!("{}: {}", l.tax_id, data.issuer.tax_id.trim()),
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
    if let Some(account) = data.issuer.bank_account.as_deref() {
        if !account.trim().is_empty() {
            ops.extend(text(
                MARGIN,
                y,
                9.5,
                false,
                &format!("{}: {}", l.bank_account, account.trim()),
            ));
            y += 5.0;
        }
    }

    y += 6.0;
    ops.extend(text(MARGIN, y, 10.5, true, l.client));
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
                &format!("{}: {}", l.tax_id, tax_id.trim()),
            ));
            y += 5.0;
        }
    }
    if let Some(address) = data.client.address.as_deref() {
        if !address.trim().is_empty() {
            ops.extend(text(MARGIN, y, 9.5, false, address.trim()));
            y += 5.0;
        }
    }

    y += 4.0;
    ops.extend(text(
        MARGIN,
        y,
        9.5,
        true,
        &format!("{}: {}", l.period, data.period),
    ));
    y += 8.0;
    ops.push(hline(y));
    y += 6.0;

    ops.extend(text(MARGIN, y, 9.5, true, l.col_date));
    ops.extend(text(MARGIN + 26.0, y, 9.5, true, l.col_concept));
    ops.extend(text(118.0, y, 9.5, true, l.col_duration));
    ops.extend(text(140.0, y, 9.5, true, l.col_rate));
    ops.extend(text(168.0, y, 9.5, true, l.col_amount));
    y += 3.0;
    ops.push(hline(y));
    y += 6.0;

    if data.lines.is_empty() {
        ops.extend(text(MARGIN, y, 9.5, false, l.empty));
        y += 6.0;
    } else {
        for line in &data.lines {
            line_ops(&mut ops, &mut y, line, data);
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
        &format!("{}: {}", l.total, money(data.total, &data.currency, lang)),
    ));

    y += 14.0;
    ops.extend(text(MARGIN, y, 8.5, false, l.footer));

    let page = PdfPage::new(Mm(PAGE_W), Mm(PAGE_H), ops);
    let mut doc = PdfDocument::new(&format!("{} {}", l.doc_title, data.number));
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{InvoiceClient, InvoiceIssuer};

    fn sample(lang: &str) -> InvoiceData {
        InvoiceData {
            number: "2026-0001".to_string(),
            issued_on: "2026-02-01".to_string(),
            period: "2026-01".to_string(),
            currency: "€".to_string(),
            issuer: InvoiceIssuer {
                name: "Academia Demo".to_string(),
                tax_id: "12345678Z".to_string(),
                address: "Calle Mayor 1".to_string(),
                email: "hola@demo.example".to_string(),
                phone: Some("600 000 000".to_string()),
                bank_account: Some("ES91 2100 0418 4502 0005 1332".to_string()),
            },
            client: InvoiceClient {
                name: "Ana García".to_string(),
                email: "ana@example.com".to_string(),
                tax_id: Some("87654321B".to_string()),
                address: Some("Calle Menor 2".to_string()),
            },
            lines: vec![InvoiceLine {
                date: "2026-01-05T10:00:00".to_string(),
                concept: "Clase de inglés".to_string(),
                duration_min: Some(60),
                rate: 30.0,
                amount: 30.0,
                event_id: Some("e1".to_string()),
            }],
            total: 30.0,
            lang: lang.to_string(),
        }
    }

    #[test]
    fn renders_a_pdf_in_spanish_and_english() {
        for lang in ["es", "en"] {
            let bytes = render(&sample(lang)).unwrap();
            assert!(
                bytes.starts_with(b"%PDF"),
                "el PDF ({lang}) no empieza por %PDF"
            );
        }
    }

    #[test]
    fn english_invoices_use_english_labels_and_number_format() {
        assert_eq!(money(30.0, "€", "en"), "€30.00");
        assert_eq!(money(30.0, "€", "es"), "30,00 €");
        assert_eq!(short_date("2026-01-05T10:00:00", "en"), "2026-01-05");
        assert_eq!(short_date("2026-01-05T10:00:00", "es"), "05/01/2026");
        assert_eq!(labels("en").title, "INVOICE");
        assert_eq!(labels("es").title, "FACTURA");
        assert_eq!(labels("fr").title, "FACTURA");
    }
}
