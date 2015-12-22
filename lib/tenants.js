var Tenant = require('./tenant');

var tenants = {};

var addTenant = function (tenantId) {
	var tenant = tenants[tenantId];

	if (!tenant) {
		tenants[tenantId] = tenant = new Tenant();
	}

	return tenant;
};

var getTenant = function (tenantId) {
	return tenants[tenantId];
};

module.exports = {
	addTenant: addTenant,
	getTenant: getTenant
};
