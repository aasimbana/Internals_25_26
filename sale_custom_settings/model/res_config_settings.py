from odoo import fields, models, api
from odoo.exceptions import ValidationError

class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    enable_default_customer = fields.Boolean(
        string='Enable Default Customer',
        config_parameter='sale.default_customer_enabled',
        company_dependent=True,
        help='If enabled, new quotations will propose the selected default customer.',
    )

    # RENOMBRADO: NO usar prefijo default_
    sale_default_customer_id = fields.Many2one(
        'res.partner',
        string='Default Customer',
        domain=[('customer_rank', '>', 0)],
        config_parameter='sale.default_customer_id',
        company_dependent=True,
        help='Customer proposed by default on new quotations.',
    )

    @api.constrains('enable_default_customer', 'sale_default_customer_id')
    def _check_required_when_enabled(self):
        for rec in self:
            if rec.enable_default_customer and not rec.sale_default_customer_id:
                raise ValidationError("Select a Default Customer when the option is enabled.")
