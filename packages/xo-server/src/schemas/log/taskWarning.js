export default {
  $schema: 'http://json-schema.org/draft-04/schema#',
  type: 'object',
  properties: {
    event: {
      enum: ['task.warning'],
    },
    taskId: {
      type: 'string',
      description: 'identifier of the parent task or job',
    },
    error: {
      type: 'object',
      description: 'warning error',
    },
  },
  required: ['event', 'parentId'],
}
