/**
 * Manages the set of tenants (rooms) that the add-on is currently active in.
 */

var Tenant = require('./tenant');

var tenants = {};

/**
 * Adds a tenant.
 *
 * @param {String} tenantId - The unique identifier of the tenant being added.
 */
var addTenant = function (tenantId) {
	var tenant = tenants[tenantId];

	if (!tenant) {
		tenants[tenantId] = tenant = new Tenant();
	}

	return tenant;
};

/**
 * Retrieves a specific tenant.
 *
 * @param   {String} tenantId - The unique identifier of the tenant we wish to retrieve.
 * @returns {Tenant} The Tenant object.
 */
var getTenant = function (tenantId) {
	return tenants[tenantId];
};

module.exports = {
	addTenant: addTenant,
	getTenant: getTenant
};
