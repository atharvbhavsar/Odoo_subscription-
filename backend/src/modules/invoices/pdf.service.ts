import PDFDocument from 'pdfkit';
import { env } from '../../config/env';
import { InvoiceDetailRecord } from './invoices.service';

export class PdfService {
  /**
   * Generates a professional, authoritative PDF invoice buffer using PDFKit.
   * Handles missing customer data gracefully with fallback defaults.
   */
  static async generateInvoicePdf(
    invoice: InvoiceDetailRecord,
    customerData?: { name?: string | null; company_name?: string | null; address?: string | null; email?: string | null } | null
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 40,
          size: 'A4',
          info: {
            Title: `Invoice ${invoice.invoice_number}`,
            Author: env.COMPANY_NAME,
            Subject: `Billing Statement for ${invoice.invoice_number}`,
          },
        });

        const buffers: Buffer[] = [];
        doc.on('data', (chunk) => buffers.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(buffers)));
        doc.on('error', (err) => reject(err));

        // Primary Brand Colors
        const primaryColor = '#4338ca'; // Indigo 700
        const darkTextColor = '#1e293b'; // Slate 800
        const mutedTextColor = '#64748b'; // Slate 500
        const borderColor = '#e2e8f0';

        // 1. Header: Company Info & Document Title
        doc.fontSize(20).fillColor(primaryColor).font('Helvetica-Bold').text(env.COMPANY_NAME, 40, 40);
        doc.fontSize(9).fillColor(mutedTextColor).font('Helvetica');
        doc.text(env.COMPANY_ADDRESS, 40, 65);
        doc.text(`Tax ID: ${env.COMPANY_TAX_ID} | Email: ${env.COMPANY_EMAIL}`, 40, 78);
        doc.text(`Website: ${env.COMPANY_WEBSITE} | Phone: ${env.COMPANY_PHONE}`, 40, 91);

        // Right side header: INVOICE & Status Badge
        doc.fontSize(22).fillColor(darkTextColor).font('Helvetica-Bold').text('INVOICE', 380, 40, { align: 'right' });
        doc.fontSize(12).fillColor(primaryColor).font('Helvetica-Bold').text(invoice.invoice_number, 380, 68, { align: 'right' });
        
        const statusLabel = (invoice.status || 'confirmed').toUpperCase();
        doc.fontSize(10).fillColor(
          invoice.status === 'paid' ? '#15803d' : invoice.status === 'partially_paid' ? '#b45309' : '#dc2626'
        ).text(`STATUS: ${statusLabel}`, 380, 85, { align: 'right' });

        // Divider
        doc.strokeColor(borderColor).lineWidth(1).moveTo(40, 115).lineTo(555, 115).stroke();

        // 2. Billing Metadata & Customer Info (Two Columns)
        // Left Column: Customer details (Safe fallback if missing)
        const custName = customerData?.name || invoice.customer_name || 'Valued Customer';
        const custCompany = customerData?.company_name || invoice.company_name || 'Individual Account';
        const custAddress = customerData?.address || invoice.customer_address || 'Address on file';
        const custEmail = customerData?.email || 'N/A';

        doc.fontSize(9).fillColor(mutedTextColor).font('Helvetica-Bold').text('BILLED TO:', 40, 130);
        doc.fontSize(10).fillColor(darkTextColor).font('Helvetica-Bold').text(custName, 40, 145);
        doc.fontSize(9).fillColor(darkTextColor).font('Helvetica');
        doc.text(custCompany, 40, 159);
        doc.text(custAddress, 40, 172);
        doc.text(`Email: ${custEmail}`, 40, 185);

        // Right Column: Dates & Subscription Info
        doc.fontSize(9).fillColor(mutedTextColor).font('Helvetica-Bold').text('STATEMENT DETAILS:', 350, 130);
        doc.fontSize(9).fillColor(darkTextColor).font('Helvetica');
        const issueDate = invoice.created_at ? invoice.created_at.split(' ')[0] : new Date().toISOString().split('T')[0];
        doc.text(`Issue Date: ${issueDate}`, 350, 145);
        doc.text(`Due Date: ${invoice.due_date || 'Due upon receipt'}`, 350, 159);
        doc.text(`Billing Period: ${invoice.period_start} to ${invoice.period_end}`, 350, 172);
        if (invoice.subscription_number) {
          doc.text(`Subscription Ref: ${invoice.subscription_number}`, 350, 185);
        }

        // Divider before line items
        doc.strokeColor(borderColor).lineWidth(1).moveTo(40, 210).lineTo(555, 210).stroke();

        // 3. Table Header
        const tableTop = 225;
        doc.rect(40, tableTop, 515, 22).fill('#f8fafc');
        doc.fontSize(9).fillColor(mutedTextColor).font('Helvetica-Bold');
        doc.text('DESCRIPTION', 50, tableTop + 6);
        doc.text('QTY', 330, tableTop + 6, { width: 40, align: 'center' });
        doc.text('UNIT PRICE', 390, tableTop + 6, { width: 70, align: 'right' });
        doc.text('SUBTOTAL', 480, tableTop + 6, { width: 65, align: 'right' });

        // 4. Line Items
        let yPos = tableTop + 28;
        doc.font('Helvetica').fontSize(9).fillColor(darkTextColor);

        const lines = invoice.lines && invoice.lines.length > 0 ? invoice.lines : [
          { description: 'Subscription Recurring Fee', quantity: 1, unit_price: invoice.subtotal, subtotal: invoice.subtotal }
        ];

        for (const line of lines) {
          const desc = line.description || 'Subscription Line Item';
          doc.text(desc, 50, yPos, { width: 260 });
          doc.text(String(line.quantity || 1), 330, yPos, { width: 40, align: 'center' });
          doc.text(`$${Number(line.unit_price || 0).toFixed(2)}`, 390, yPos, { width: 70, align: 'right' });
          doc.text(`$${Number(line.subtotal || 0).toFixed(2)}`, 480, yPos, { width: 65, align: 'right' });
          
          yPos += 22;
          doc.strokeColor('#f1f5f9').lineWidth(0.5).moveTo(40, yPos - 4).lineTo(555, yPos - 4).stroke();
        }

        // 5. Totals & Reconciliation Summary (Right aligned)
        yPos += 15;
        const totalsLeft = 350;
        const valuesLeft = 470;
        const totalWidth = 75;

        doc.fontSize(9).fillColor(mutedTextColor).font('Helvetica');
        doc.text('Subtotal:', totalsLeft, yPos);
        doc.fillColor(darkTextColor).text(`$${Number(invoice.subtotal).toFixed(2)}`, valuesLeft, yPos, { width: totalWidth, align: 'right' });

        if (Number(invoice.discount_amount) > 0) {
          yPos += 16;
          doc.fillColor('#16a34a').text('Discount:', totalsLeft, yPos);
          doc.text(`-$${Number(invoice.discount_amount).toFixed(2)}`, valuesLeft, yPos, { width: totalWidth, align: 'right' });
        }

        if (Number(invoice.tax_amount) > 0) {
          yPos += 16;
          doc.fillColor(mutedTextColor).text('Taxes & Levies:', totalsLeft, yPos);
          doc.fillColor(darkTextColor).text(`+$${Number(invoice.tax_amount).toFixed(2)}`, valuesLeft, yPos, { width: totalWidth, align: 'right' });
        }

        yPos += 18;
        doc.strokeColor(borderColor).lineWidth(1).moveTo(totalsLeft, yPos - 4).lineTo(555, yPos - 4).stroke();
        doc.fontSize(11).fillColor(darkTextColor).font('Helvetica-Bold').text('Invoice Total:', totalsLeft, yPos);
        doc.fontSize(11).fillColor(darkTextColor).text(`$${Number(invoice.total_amount).toFixed(2)}`, valuesLeft, yPos, { width: totalWidth, align: 'right' });

        yPos += 18;
        doc.fontSize(9).fillColor('#2563eb').font('Helvetica').text('Amount Paid:', totalsLeft, yPos);
        doc.text(`$${Number(invoice.amount_paid).toFixed(2)}`, valuesLeft, yPos, { width: totalWidth, align: 'right' });

        yPos += 18;
        const balanceDue = Number(invoice.amount_due);
        doc.fontSize(11).fillColor(balanceDue > 0 ? '#dc2626' : '#16a34a').font('Helvetica-Bold');
        doc.text('Balance Due:', totalsLeft, yPos);
        doc.text(`$${balanceDue.toFixed(2)}`, valuesLeft, yPos, { width: totalWidth, align: 'right' });

        // 6. Payment Instructions & Footer
        const footerY = Math.max(yPos + 40, 680);
        doc.rect(40, footerY, 515, 60).fill('#f8fafc');
        doc.strokeColor(borderColor).lineWidth(1).rect(40, footerY, 515, 60).stroke();

        doc.fontSize(9).fillColor(primaryColor).font('Helvetica-Bold').text('PAYMENT INSTRUCTIONS', 50, footerY + 10);
        doc.fontSize(8).fillColor(darkTextColor).font('Helvetica');
        doc.text(env.PAYMENT_INSTRUCTIONS, 50, footerY + 24, { width: 495 });

        // Bottom page note
        doc.fontSize(8).fillColor(mutedTextColor).text(
          `Thank you for choosing ${env.COMPANY_NAME}. For billing inquiries, email ${env.COMPANY_EMAIL}.`,
          40,
          780,
          { align: 'center', width: 515 }
        );

        doc.end();
      } catch (err) {
        reject(err);
      }
    });
  }
}

