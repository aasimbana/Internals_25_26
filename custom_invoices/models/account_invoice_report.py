
from odoo import models, fields

class AccountInvoiceReport(models.Model):
    _inherit = 'account.invoice.report'

    provincia_id = fields.Many2one(
        'res.country.state',
        string="Provincia",
        readonly=True
    )

    def _select(self):
        select_str = super()._select()
        select_str += ", partner.state_id AS provincia_id"
        return select_str

    def _from(self):
        from_str = super()._from()
        return from_str

    def _where(self):
        where_str = super()._where()
        where_str += """
        AND partner.state_id IS NOT NULL
        AND partner.city IS NOT NULL
        AND partner.state_id IN (
            SELECT id FROM res_country_state WHERE country_id IN (
                SELECT id FROM res_country WHERE code = 'EC'
            )
        )
    """
        return where_str
