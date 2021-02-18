// Applies passed transformer to the result returned by the method
//
// @decorateResult(transform)
// method () {}
exports.decorateResult = fn => (target, name, descriptor) => ({
  ...descriptor,
  value: function () {
    return fn.call(this, descriptor.value.apply(this, arguments), ...arguments)
  },
})
