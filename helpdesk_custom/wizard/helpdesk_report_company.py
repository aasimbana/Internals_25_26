from odoo import api, fields, models
import base64  

class HelpdeskReportCompany(models.TransientModel):
    _name = 'helpdesk.report.company'
    _description = 'Helpdesk Report Company Wizard'
    
    date_start = fields.Date(string='Start Date')
    date_end = fields.Date(string='End Date')
    company_id = fields.Many2one(
        "res.company",
        string="Company",
        # default=lambda self: self.env.company.id
    )
   
    xlsx_file = fields.Binary(string='Generated XLSX Report', readonly=True)
    xlsx_filename = fields.Char(string='Filename', size=64)

    def generate_xlsx_report_company(self):  # Asegúrate que este nombre coincida con el XML
        # Use the AbstractModel to generate the report
        report_data = self.env['helpdesk.report.by.company.xlsx'].generate_xlsx_report(self)
        
        # Save the file to binary field
        self.write({
            'xlsx_file': base64.b64encode(report_data),
            'xlsx_filename': f'company_report_{fields.Date.today()}.xlsx'
        })
        
        # Return download action
        return {
            'type': 'ir.actions.act_url',
            'url': f'/web/content/helpdesk.report.company/{self.id}/xlsx_file/{self.xlsx_filename}?download=true',
            'target': 'self',
        }
        
    def generate_pdf_report_company(self):
        return self.env.ref("helpdesk_custom.action_report_company_helpdesk_pdf").report_action(self)
