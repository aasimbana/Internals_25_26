import json
from datetime import datetime, time
from odoo import models

class DailyReportPdf(models.AbstractModel):
    _name = "report.helpdesk_custom.day_report_template"
    _description = "Daily Report - Helpdesk KPI (PDF)"

    def _get_report_values(self, docids, data=None):
        wizard = self.env['helpdesk.report.date'].browse(docids)

        # Retrieve states dynamically (except 'new')
        self.env.cr.execute("""
            SELECT DISTINCT stage_type 
            FROM helpdesk_support 
            WHERE stage_type IS NOT NULL
            ORDER BY stage_type
        """)
        stages = [row[0] for row in self.env.cr.fetchall() if row[0] != 'new']

        # Employees support
        employees = wizard.employee_ids or self.env['hr.employee'].search([('technical_support', '=', True)])
        employees = employees.sorted(key=lambda r: r.name)
        user_ids = employees.mapped('user_id.id')

        # Tickets of the day
        domain = [('company_id', '=', wizard.company_id.id),
                ('user_id', 'in', user_ids)]
        if wizard.date_start:
            domain += [('close_date', '>=', datetime.combine(wizard.date_start, time.min)),
                    ('close_date', '<=', datetime.combine(wizard.date_start, time.max))]
        tickets = self.env['helpdesk.support'].search(domain)

        # Initialize counts
        counts = {stage: {emp.name: 0 for emp in employees} for stage in stages}
        total_closed = 0

        for ticket in tickets:
            tecnico_name = ticket.user_id.employee_id.name if ticket.user_id.employee_id else 'Sin asignar'
            stage_actual = ticket.stage_type or "Sin Estado"

            if stage_actual != 'new':
                counts.setdefault(stage_actual, {emp.name: 0 for emp in employees})
                counts[stage_actual][tecnico_name] = counts[stage_actual].get(tecnico_name, 0) + 1
                if stage_actual == 'closed':
                    total_closed += 1

        # Tickets new
        total_new = 0
        if wizard.date_start:
            self.env.cr.execute("""
                SELECT COUNT(*) FROM helpdesk_support
                WHERE stage_type='new' AND DATE(create_date)=%s
            """, (wizard.date_start,))
            total_new = self.env.cr.fetchone()[0] or 0

        return {
            "doc_ids": docids,
            "doc_model": "helpdesk.report.date",
            "data": {
                "stages": stages,
                "employees": [{"name": e.name, "id": e.id} for e in employees],
                "counts": counts,
                "total_closed": total_closed,
                "total_new": total_new,
                "start_date": wizard.date_start.strftime("%d/%m/%Y") if wizard.date_start else "N/A",
                "generation_date": datetime.now().strftime("%d/%m/%Y %H:%M"),
            },
            "docs": wizard,
        }
