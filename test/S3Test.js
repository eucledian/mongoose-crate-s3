'use strict'

require('dotenv').config()
const expect = require('chai').expect
const path = require('path')
const request = require('request')
const async = require('async')
const S3 = require('../')
const sinon = require('sinon')
const proxyquire = require('proxyquire')
const describe = require('mocha').describe
const it = require('mocha').it

const bucket = process.env.CRATE_BUCKET
const key = process.env.CRATE_KEY
const secret = process.env.CRATE_SECRET
const endpoint = process.env.CRATE_ENDPOINT

describe('S3', () => {
  it('should require options', () => {
    expect(() => new S3()).to.throw
  })

  it('should require a key', () => {
    expect(() => new S3({})).to.throw
  })

  it('should require a secret', () => {
    expect(() => new S3({
      key: 'foo'
    })).to.throw
  })

  it('should require a bucket', () => {
    expect(() => new S3({
      key: 'foo',
      secret: 'bar'
    })).to.throw
  })

  it('should set a default acl', () => {
    const s3 = new S3({
      key: 'foo',
      secret: 'bar',
      bucket: 'baz'
    })
    expect(s3._options.acl).to.be.ok
  })

  it('should accept an acl', () => {
    const s3 = new S3({
      key: 'foo',
      secret: 'bar',
      bucket: 'baz',
      acl: 'qux'
    })
    expect(s3._options.acl).to.equal('qux')
  })

  it('should set a default region', () => {
    const s3 = new S3({
      key: 'foo',
      secret: 'bar',
      bucket: 'baz'
    })
    expect(s3._options.region).to.be.ok
  })

  it('should accept a region', () => {
    const s3 = new S3({
      key: 'foo',
      secret: 'bar',
      bucket: 'baz',
      region: 'qux'
    })
    expect(s3._options.region).to.equal('qux')
  })

  it('should accept a endpoint', () => {
    const s3 = new S3({
      key: 'foo',
      secret: 'bar',
      bucket: 'baz',
      endpoint: 'qux'
    })
    expect(s3._options.endpoint).to.equal('qux')
  })

  it('should store and remove a file', (done) => {
    // network operations are slow

    const sourceFile = path.resolve(path.join(__dirname, '.', 'fixtures', 'node_js_logo.png'))

    const s3 = new S3({
      key: key,
      secret: secret,
      bucket: bucket,
      endpoint: endpoint
    })

    let s3Url

    async.waterfall([(callback) => {
      // save the file
      s3.save({path: sourceFile}, callback)
    }, (url, callback) => {
      s3Url = url

      // make sure it was uploaded
      request.head(url, callback)
    }, (response, body, callback) => {
      // resource should exist
      expect(response.statusCode).to.equal(200)

      // remove the file
      s3.remove({url: s3Url}, callback)
    }, (message, callback) => {
      // make sure it's not there any more
      request.head(s3Url, callback)
    }, (response, body, callback) => {
      // resource should exist
      expect(response.statusCode).to.not.equal(200)

      // all done
      callback()
    }], (error) => {
      expect(error).to.not.exist

      done()
    })
  }).timeout(10000)

  it('should remove a file', (done) => {
    const client = {
      deleteFile: sinon.stub()
    }

    const S3 = proxyquire('../lib/S3', {
      'knox': {
        createClient: () => {
          return client
        }
      }
    })

    const s3 = new S3({
      key: key,
      secret: secret,
      bucket: bucket,
      endpoint: endpoint
    })

    const filename = '/foo'

    client.deleteFile.callsArg(1)

    s3.remove({
      url: filename
    }, (result, url) => {
      expect(url).to.equal(`https://${process.env.CRATE_BUCKET}.${process.env.CRATE_ENDPOINT}${filename}`)

      done()
    })
  })

  it('should remove a file with a long path', (done) => {
    const client = {
      deleteFile: sinon.stub()
    }

    const S3 = proxyquire('../lib/S3', {
      'knox': {
        createClient: () => {
          return client
        }
      }
    })

    const s3 = new S3({
      key: key,
      secret: secret,
      bucket: bucket,
      endpoint: endpoint
    })

    client.deleteFile.callsArg(1)

    const filename = '/foo/bar/baz.zip'

    s3.remove({
      url: filename
    }, (result, url) => {
      expect(url).to.equal(`https://${process.env.CRATE_BUCKET}.${process.env.CRATE_ENDPOINT}${filename}`)

      done()
    })
  })

  it('should not remove a file with no URL', (done) => {
    const client = {
      deleteFile: sinon.stub()
    }

    const S3 = proxyquire('../lib/S3', {
      'knox': {
        createClient: () => {
          return client
        }
      }
    })

    const s3 = new S3({
      key: key,
      secret: secret,
      bucket: bucket,
      endpoint: endpoint
    })

    client.deleteFile.callsArg(1)

    s3.remove({
      url: null
    }, () => {
      expect(client.deleteFile.callCount).to.equal(0)

      done()
    })
  })

  it('should check the statusCode of the response', (done) => {
    const S3 = proxyquire('../lib/S3', {
      'knox': {
        createClient: () => {
          return {}
        }
      }
    })

    const s3 = new S3({
      key: key,
      secret: secret,
      bucket: bucket,
      endpoint: endpoint,
      path: (attachment) => {
        expect(attachment).to.be.ok

        return attachment
      }
    })

    let ret = s3._queryResult(true, null, sinon.stub().returnsArg(0))
    expect(ret).to.be.true

    let res = {
      on: sinon.stub(),
      statusCode: 200,
      req: {
        url: 'fakeurl'
      }
    }
    ret = s3._queryResult(false, res, sinon.stub().returnsArg(1))
    expect(ret).to.equal('fakeurl')

    const err = new Error()
    err.statusCode = 300
    err.body = 'mouse'

    res = {
      on: (type, chunkfunc) => {
        if (type === 'data') {
          chunkfunc('mouse')
        } else {
          ret = chunkfunc()
        }
      },
      statusCode: 300
    }
    s3._queryResult(false, res, sinon.stub().returnsArg(0))

    expect(ret.statusCode).to.equal(err.statusCode)
    expect(ret.body).to.equal(err.body)

    done()
  })
})
