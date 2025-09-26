from odoo import api, fields, models
import base64
from datetime import datetime, timedelta
import xlsxwriter

class HelpdeskReportGeneral(models.TransientModel):
    _name = "helpdesk.report.general"
    _description = "Wizard Reporte General de Helpdesk"

    company_id = fields.Many2one(
        "res.company",
        string="Company",
        default=lambda self: self.env.company.id,
        readonly=True
    )

    date_start = fields.Date(string="date start", required=True)
    date_end = fields.Date(string="date end", required=True)

    # # Botón: generar PDF
    # def generate_pdf_report_company(self):
    #     return True

    def generate_xlsx_report_general(self):
        report_service = self.env["helpdesk.report.general.xlsx"]
        
        # Genera el reporte de septiembre 2025 directamente
        file_content = report_service.generate_report_general_xlsx(self)

        if not file_content:
            from odoo.exceptions import UserError
            raise UserError("No se generó contenido en el reporte XLSX.")

        # Guardar archivo en ir.attachment
        import base64
        filename = "reporte_helpdesk_septiembre_2025.xlsx"
        attachment = self.env["ir.attachment"].create({
            "name": filename,
            "type": "binary",
            "datas": base64.b64encode(file_content),
            "res_model": self._name,
            "res_id": self.id,
            "mimetype": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        })

        return {
            "type": "ir.actions.act_url",
            "url": f"/web/content/{attachment.id}?download=true",
            "target": "self",
        }

    def action_generate_pdf_general(self):
        """ Generate PDF """
        return self.env.ref("helpdesk_custom.action_report_general_helpdesk_pdf").report_action(self)