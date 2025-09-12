from odoo import models, fields, api, _
from odoo.exceptions import UserError
import logging

_logger = logging.getLogger(__name__)

class HelpdeskSupport(models.Model):
    _inherit = "helpdesk.support"

    type_ticket_id = fields.Many2one('ticket.type', string="Type of Ticket", required=True)
    subject_type_id = fields.Many2one('type.of.subject', string="Type of Subject", required=True)
    user_id = fields.Many2one("res.users", string="Assign To", required=True)
    email = fields.Char(string="Email", required=True)
    company_id = fields.Many2one('res.company', string="Company", required=True)

    def set_to_close(self):
        incomplete_tasks = []

        for task in self.task_id:
            if task.state != '1_done':
                incomplete_tasks.append(task.name)

        if incomplete_tasks:
            raise UserError(
                _("No puedes cerrar: las siguientes tareas no están terminadas: %s")
                % ", ".join(incomplete_tasks[:10])  # opcional limitar a 10 tareas
            )
        return super(HelpdeskSupport, self).set_to_close()

    