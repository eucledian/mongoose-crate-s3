'use strict'

const path = require('path')
const url = require('url')
const knox = require('knox-s3')
const check = require('check-types')

class S3StorageProvider {
  /**
   * S3StorageProvider initialization
   * @param options Object hash containing options
   * @return S3StorageProvider class
   */
  constructor (options) {
    this._options = options

    check.assert.object(this._options, 'Please specify S3 options')
    check.assert.string(this._options.key, 'Please specify a S3 key')
    check.assert.string(this._options.secret, 'Please specify a S3 secret')
    check.assert.string(this._options.bucket, 'Please specify a S3 bucket')

    if (!this._options.acl) {
      this._options.acl = 'public-read'
    }

    if (!this._options.region) {
      this._options.region = 'us-standard'
    }

    if (typeof this._options.path !== 'function') {
      this._options.path = (attachment) => {
        return '/' + path.basename(attachment.path)
      }
    }

    let knoxOptions = {
      key: this._options.key,
      secret: this._options.secret,
      bucket: this._options.bucket,
      region: this._options.region
    }

    if (this._options.endpoint) {
      knoxOptions.endpoint = this._options.endpoint
    }

    this._client = knox.createClient(knoxOptions)
  }

  /**
   * Saves provided object to S3
   * @param attachment file to upload
   * @param callback Callback function for execution
   * @return
   */
  save (attachment, callback) {
    const headers = attachment.headers || {}
    headers['x-amz-acl'] = this._options.acl

    this._client.putFile(attachment.path, this._options.path(attachment), headers, (error, res) => {
      this._queryResult(error, res, callback)
    })
  }

  /**
   * deletes provided object to S3
   * @param attachment file to upload
   * @param callback Callback function for execution
   * @return
   */
  remove (attachment, callback) {
    if (!attachment.url) {
      return callback()
    }

    this._client.deleteFile(url.parse(attachment.url)['path'], (error, res) => {
      this._queryResult(error, res, callback)
    })
  }

  _queryResult (error, res, callback) {
    if (error) {
      return callback(error)
    }

    if (res && 'on' in res) {
      if (res.statusCode >= 200 && res.statusCode <= 209) {
        return callback(null, res.req.url)
      }

      let body = ''

      res.on('data', function (chunk) {
        body += chunk
      })

      res.on('end', function () {
        const err = new Error()
        err.statusCode = res.statusCode
        err.body = body

        return callback(err)
      })
    } else {
      if (res && 'req' in res) {
        callback(null, res.req.url)
      } else {
        callback()
      }
    }
  }
}

module.exports = S3StorageProvider
