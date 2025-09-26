from odoo import api, fields, models
import base64  
# Necesitarías crear este modelo en Python
class HelpdeskReportDate(models.TransientModel):
    _name = 'helpdesk.report.date'
    _description = 'Helpdesk Report Date Wizard'
    
    date_start = fields.Date(string='Start Date')
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

    # En tu wizard helpdesk_report_date.py
    def action_generate_reporte_dia(self):
        report_helper = self.env['helpdesk.reporte.por.dia.xlsx']
        excel_data = report_helper.generate_report_per_day_xlsx(self)
        
        # Crear attachment
        attachment = self.env['ir.attachment'].create({
            'name': f"Reporte_Por_Dia_{fields.Date.today()}.xlsx",
            'datas': base64.b64encode(excel_data),
            'res_model': self._name,
            'res_id': self.id,
            'type': 'binary'
        })
        
        return {
            'type': 'ir.actions.act_url',
            'url': f'/web/content/{attachment.id}?download=true',
            'target': 'self',
        }
    def action_generate_day_report_pdf(self):
        self.ensure_one()
        if not self.exists():
            raise UserError("The assistant has expired, open it again.")
        return self.env.ref("helpdesk_custom.action_report_day_helpdesk_pdf").report_action(self)
  