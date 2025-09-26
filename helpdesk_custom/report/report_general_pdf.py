from odoo import models
from odoo.exceptions import UserError
from datetime import datetime, time

class GeneralReportPdf(models.AbstractModel):
    _name = "report.helpdesk_custom.general_report_template"
    _description = "General Helpdesk Report by Date (PDF)"

    def _get_report_values(self, docids, data=None):
        # Get wizard record
        wizard = self.env['helpdesk.report.general'].browse(docids)

        # Validate date range
        if not wizard.date_start or not wizard.date_end:
            raise UserError("You must select a start and end date in the wizard.")

        start_date = datetime.combine(wizard.date_start, time.min)
        end_date = datetime.combine(wizard.date_end, time.max)

        #  Get all unique ticket states
        self.env.cr.execute("""
            SELECT DISTINCT stage_type 
            FROM helpdesk_support 
            WHERE stage_type IS NOT NULL
            ORDER BY stage_type
        """)
        stage_types = [row[0] for row in self.env.cr.fetchall()]
        if not stage_types:
            raise UserError("No valid ticket states found in the database.")

        # Get company
        company = self.env['res.company'].search([('name', '=', 'ADSSOFTWARE CIA LTDA')], limit=1)
        if not company:
            raise UserError("Company 'ADSSOFTWARE CIA LTDA' not found.")

        # Search tickets by request_date
        tickets = self.env['helpdesk.support'].search([
            ('request_date', '>=', start_date),
            ('request_date', '<=', end_date),
            ('company_id', '=', company.id),
            ('active', '=', True),
            ('stage_type', '!=', False),
        ])

        if not tickets:
            raise UserError("No tickets found in the specified date range for ADSSOFTWARE CIA LTDA.")

        #  Build daily data grouped by date and state
        daily_data = {}
        total_by_state = {state: 0 for state in stage_types}
        grand_total = 0

        for ticket in tickets:
            # Skip closed tickets that are not marked as closed
            if ticket.stage_type == "closed" and not ticket.is_close:
                continue

            if not ticket.request_date:
                continue

            date_str = ticket.request_date.date().strftime("%d/%m/%Y")
            state = ticket.stage_type

            if date_str not in daily_data:
                daily_data[date_str] = {st: 0 for st in stage_types}

            daily_data[date_str][state] += 1
            total_by_state[state] += 1
            grand_total += 1

        # Create structured list for QWeb rendering
        rows = []
        for date_str in sorted(daily_data.keys(), key=lambda d: datetime.strptime(d, "%d/%m/%Y")):
            total_day = sum(daily_data[date_str].values())
            rows.append({
                "date": date_str,
                "states": daily_data[date_str],
                "total": total_day
            })

        #  Return context data to the QWeb template
        return {
            "doc_ids": docids,
            "doc_model": "helpdesk.report.date",
            "data": {
                "stage_types": stage_types,
                "rows": rows,
                "total_by_state": total_by_state,
                "grand_total": grand_total,
                "start_date": wizard.date_start.strftime("%d/%m/%Y"),
                "end_date": wizard.date_end.strftime("%d/%m/%Y"),
                "generated_at": datetime.now().strftime("%d/%m/%Y %H:%M"),
                "company_name": company.name,
            },
            "docs": wizard,
        }
