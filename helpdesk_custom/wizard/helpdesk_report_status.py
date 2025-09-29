from odoo import models, fields, api
import base64

class helpdesk_report_status(models.TransientModel):
    _name = 'helpdesk.report.status'
    _description = 'Helpdesk Report Status Wizard'
    
    date_end = fields.Date(string="Fecha fin") 
    company_id = fields.Many2one(
        "res.company",
        string="Company",
        default=lambda self: self.env.company.id
    )
    employee_ids = fields.Many2many(
        "hr.employee",
        string="Support Employees",
        domain=[("technical_support", "=", True)]
    )

    def action_generate_report_status_xlsx(self):
        report_model = self.env['helpdesk.report.status.xlsx']

        try:
            xlsx_data = report_model.generate_report_status_xlsx(self)
        except UserError as e:
            raise UserError(e.name) 

        
        attachment = self.env['ir.attachment'].create({
            'name': f'Helpdesk_Status_Report_{self.date_end}.xlsx',
            'type': 'binary',
            'datas': base64.b64encode(xlsx_data),
            'mimetype': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'res_model': self._name,
            'res_id': self.id,
        })

        return {
            'type': 'ir.actions.act_url',
            'url': f'/web/content/{attachment.id}?download=true',
            'target': 'new',
        }

    def action_print_status_report_pdf(self):
        return self.env.ref('helpdesk_custom.action_report_status_helpdesk_pdf').report_action(self)