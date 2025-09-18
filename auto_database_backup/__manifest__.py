###############################################################################
#
#    Cybrosys Technologies Pvt. Ltd.
#
#    Copyright (C) 2023-TODAY Cybrosys Technologies(<https://www.cybrosys.com>)
#    Author: Cybrosys Techno Solutions (odoo@cybrosys.com)
#
#    You can modify it under the terms of the GNU LESSER
#    GENERAL PUBLIC LICENSE (LGPL v3), Version 3.
#
#    This program is distributed in the hope that it will be useful,
#    but WITHOUT ANY WARRANTY; without even the implied warranty of
#    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
#    GNU LESSER GENERAL PUBLIC LICENSE (LGPL v3) for more details.
#
#    You should have received a copy of the GNU LESSER GENERAL PUBLIC LICENSE
#    (LGPL v3) along with this program.
#    If not, see <http://www.gnu.org/licenses/>.
#
###############################################################################
{
    "name": "=,"
    "Google Drive, Dropbox, Onedrive, Nextcloud and Amazon S3 Odoo17",
    "version": "17.0.6.0.1",
    "live_test_url": "https://youtu.be/Q2yMZyYjuTI",
    "category": "Extra Tools",
    "author": "Cybrosys Techno Solutions",
    "company": "Cybrosys Techno Solutions",
    "maintainer": "Cybrosys Techno Solutions",
    "website": "https://github.com/Fenix-ERP/l10n-ecuador",
    "depends": ["base", "mail"],
    "data": [
        "security/ir.model.access.csv",
        "data/ir_cron_data.xml",
        "data/mail_template_data.xml",
        "views/db_backup_configure_views.xml",
        "views/res_config_backup.xml",
        "wizard/dropbox_auth_code_views.xml",
    ],
    "external_dependencies": {
        "python": [
            "dropbox",
            "pyncclient",
            "boto3",
            "nextcloud-api-wrapper",
            "paramiko",
            "nextcloud",
            "nextcloud_client",
        ]
    },
    "images": ["static/description/banner.gif"],
    "license": "LGPL-3",
    "installable": True,
    "auto_install": False,
    "application": False,
}
