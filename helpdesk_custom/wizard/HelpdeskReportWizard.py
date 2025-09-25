from odoo import api, fields, models
import base64
from datetime import datetime, time 

class HelpdeskReportWizard(models.TransientModel):
    _name = "helpdesk.report.wizard"
    _description = "Helpdesk Report Wizard"

    date_start = fields.Date(string="start date")
    date_end = fields.Date(string="end date")
    company_id = fields.Many2one(
        "res.company",
        string="company",
        default=lambda self: self.env.company.id
    )
    employee_ids = fields.Many2many(
        "hr.employee",
        string="employees support",
        domain=[("technical_support", "=", True)]
    )

    def action_generate_excel(self):
        """ Generate Excel """
        self.ensure_one()
        helper = self.env['helpdesk.report.xlsx.helper']
        xlsx_data = helper.generate_helpdesk_report_xlsx(self)

        filename = 'Reporte_Helpdesk_%s.xlsx' % (fields.Date.today().strftime("%Y%m%d"))
        attachment = self.env['ir.attachment'].create({
            'name': filename,
            'type': 'binary',
            'datas': base64.b64encode(xlsx_data),
            'res_model': self._name,
            'res_id': self.id,
            'mimetype': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        })

        return {
            'type': 'ir.actions.act_url',
            'url': f'/web/content/{attachment.id}?download=true',
            'target': 'self',
        }
    
    def action_generate_pdf(self):
        """ Generate PDF """
        return self.env.ref("helpdesk_custom.action_report_helpdesk_pdf").report_action(self)


