from datetime import datetime, time
from odoo import models, fields, api 
from odoo.exceptions import UserError

class ReportByCompanyPdf(models.AbstractModel):
    _name = "report.helpdesk_custom.company_report_template"
    _description = "Report by Company - Helpdesk KPI (PDF)"

    def _get_report_values(self, docids, data=None):
        data = data or {}
        wizard = self.env['helpdesk.report.company'].browse(docids[0] if docids else [])

        if not wizard.exists():
            raise UserError("The wizard record no longer exists")

        self.env.cr.execute("""
            SELECT DISTINCT stage_type 
            FROM helpdesk_support 
            WHERE stage_type IS NOT NULL 
            ORDER BY stage_type ASC
        """)
        results = self.env.cr.fetchall()
        stage_types = [row[0] for row in results if row[0] is not None]

        companies = [wizard.company_id] if wizard.company_id else self.env['res.company'].search([])

        company_data = {}
        overall_totals = {}
        overall_total = 0

        for company in companies:
            company_data[company.id] = {
                'name': company.name,
                'stage_counts': {},
                'total': 0
            }

            domain = [('company_id', '=', company.id)]
            tickets = self.env['helpdesk.support'].search(domain)

            for ticket in tickets:
                stage = ticket.stage_type or 'None'

                if stage == 'closed':
                    fecha = ticket.close_date
                else:
                    fecha = ticket.create_date

                if wizard.date_start and (not fecha or fecha.date() < wizard.date_start):
                    continue
                if wizard.date_end and (not fecha or fecha.date() > wizard.date_end):
                    continue

                company_data[company.id]['stage_counts'].setdefault(stage, 0)
                company_data[company.id]['stage_counts'][stage] += 1
                company_data[company.id]['total'] += 1

                overall_totals.setdefault(stage, 0)
                overall_totals[stage] += 1

            overall_total += company_data[company.id]['total']

        all_stages_found = list(set(stage_types + list(overall_totals.keys())))
        all_stages_found.sort()

        return {
            "doc_ids": docids,
            "doc_model": "helpdesk.report.company",
            "docs": wizard,
            "data": {
                "start_date": wizard.date_start or "",
                "end_date": wizard.date_end or "",
                "company_filter": wizard.company_id.name if wizard.company_id else "All",
                "stage_types": all_stages_found,
                "companies": list(company_data.values()),
                "overall_totals": overall_totals,
                "overall_total": overall_total,
                "generation_date": fields.Date.today(),
            },
            "company": self.env.company,
            "res_company": self.env.company,
        }
