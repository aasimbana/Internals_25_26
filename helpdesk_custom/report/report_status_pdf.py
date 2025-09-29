from odoo import models
from odoo.exceptions import UserError
from datetime import datetime, time

class HelpdeskReportStatusPdf(models.AbstractModel):
    _name = "report.helpdesk_custom.report_status_template"
    _description = "Helpdesk Status Report PDF"

    def _get_report_values(self, docids, data=None):
        wizard = self.env['helpdesk.report.status'].browse(docids)

        if not wizard.date_end:
            raise UserError("You must select an end date in the wizard.")

        end_date = datetime.combine(wizard.date_end, time.max)
        # Obtener estados únicos
        self.env.cr.execute("""
            SELECT DISTINCT stage_type
            FROM helpdesk_support
            WHERE stage_type IS NOT NULL
            ORDER BY stage_type
        """)
        stage_types = [r[0] for r in self.env.cr.fetchall() if r[0] is not None]

        company = wizard.company_id
        if not company:
            raise UserError("You must select a valid company.")

        tickets = self.env['helpdesk.support'].search([
            ('request_date', '<=', end_date),
            ('company_id', '=', company.id),
            ('active', '=', True),
            ('stage_type', '!=', False),
        ])

        if not tickets:
            raise UserError(f"No tickets were found for {company.name} up to {wizard.date_end}.")

        data_matrix = {stage: {st: 0 for st in stage_types} for stage in stage_types}
        totals = {stage: 0 for stage in stage_types}
        grand_total = 0

        for ticket in tickets:
            stage = str(ticket.stage_type)
            data_matrix[stage][stage] += 1
            totals[stage] += 1
            grand_total += 1

        rows = []
        for main_stage, counts in data_matrix.items():
            total_row = sum(counts.values())
            row = {
                "stage": main_stage,
                "counts": counts,
                "total": total_row
            }
            rows.append(row)

        return {
            "doc_ids": docids,
            "doc_model": "helpdesk.report.status",
            "docs": wizard,
            "company_name": company.name,
            "end_date": wizard.date_end.strftime("%d/%m/%Y"),
            "stage_types": stage_types,
            "rows": rows,
            "totals": totals,
            "grand_total": grand_total,
            "generated_at": datetime.now().strftime("%d/%m/%Y %H:%M"),
        }