/**
 * Manages the set of tenants (rooms) that the add-on is currently active in.
 */

var Tenant = require('./tenant');

var tenants = {};

/**
 * Adds a tenant.
 *
 * @param {String} id - The unique identifier of the tenant being added.
 */
var addTenant = function (id) {
	var tenant = tenants[id];

	if (!tenant) {
		tenants[id] = tenant = new Tenant(id);
	}

	return tenant;
};

/**
 * Retrieves a specific tenant.
 *
 * @param   {String} id - The unique identifier of the tenant we wish to retrieve.
 * @returns {Tenant} The Tenant object.
 */
var getTenant = function (id) {
	return tenants[id];
};

module.exports = {
	addTenant: addTenant,
	getTenant: getTenant
};
