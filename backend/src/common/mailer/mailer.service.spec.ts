import { Test, TestingModule } from '@nestjs/testing';
import { MailerService } from './mailer.service';
import { MAILER_OPTIONS } from './mailer.interface';
import * as nodemailer from 'nodemailer';

jest.mock('nodemailer');

describe('MailerService', () => {
  let service: MailerService;
  let mockTransporter: any;

  beforeEach(async () => {
    // Create a complete mock transporter that supports both callback and promise styles
    mockTransporter = {
      sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
      verify: jest.fn((callback) => {
        // Support callback style (used in constructor)
        if (callback) {
          callback(null, true);
        }
        // Support promise style (used in verifyConnection method)
        return Promise.resolve(true);
      }),
    };

    (nodemailer.createTransport as jest.Mock) = jest.fn().mockReturnValue(mockTransporter);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailerService,
        {
          provide: MAILER_OPTIONS,
          useValue: {
            transport: {
              host: 'smtp.test.com',
              port: 587,
              auth: {
                user: 'test@test.com',
                pass: 'password',
              },
            },
            defaults: {
              from: '"Test" <test@test.com>',
            },
          },
        },
      ],
    }).compile();

    service = module.get<MailerService>(MailerService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createTransport', () => {
    it('should create transporter with provided options', () => {
      expect(nodemailer.createTransport).toHaveBeenCalled();
    });

    it('should verify transporter connection', () => {
      expect(mockTransporter.verify).toHaveBeenCalled();
    });
  });

  describe('sendMail', () => {
    it('should send email successfully', async () => {
      const mailOptions = {
        to: 'recipient@test.com',
        subject: 'Test Subject',
        text: 'Test Body',
      };

      const result = await service.sendMail(mailOptions);

      expect(mockTransporter.sendMail).toHaveBeenCalled();
      expect(result).toHaveProperty('messageId', 'test-id');
    });

    it('should use default "from" if not provided', async () => {
      const mailOptions = {
        to: 'recipient@test.com',
        subject: 'Test',
        text: 'Body',
      };

      await service.sendMail(mailOptions);

      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.from).toBe('"Test" <test@test.com>');
    });

    it('should override default "from" if provided', async () => {
      const mailOptions = {
        from: 'custom@test.com',
        to: 'recipient@test.com',
        subject: 'Test',
        text: 'Body',
      };

      await service.sendMail(mailOptions);

      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.from).toBe('custom@test.com');
    });

    it('should handle multiple recipients in array', async () => {
      const mailOptions = {
        to: ['user1@test.com', 'user2@test.com'],
        subject: 'Test',
        text: 'Body',
      };

      await service.sendMail(mailOptions);

      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.to).toBe('user1@test.com, user2@test.com');
    });

    it('should handle single recipient as string', async () => {
      const mailOptions = {
        to: 'user@test.com',
        subject: 'Test',
        text: 'Body',
      };

      await service.sendMail(mailOptions);

      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.to).toBe('user@test.com');
    });

    it('should handle CC recipients', async () => {
      const mailOptions = {
        to: 'user@test.com',
        cc: ['cc1@test.com', 'cc2@test.com'],
        subject: 'Test',
        text: 'Body',
      };

      await service.sendMail(mailOptions);

      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.cc).toBe('cc1@test.com, cc2@test.com');
    });

    it('should handle BCC recipients', async () => {
      const mailOptions = {
        to: 'user@test.com',
        bcc: 'bcc@test.com',
        subject: 'Test',
        text: 'Body',
      };

      await service.sendMail(mailOptions);

      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.bcc).toBe('bcc@test.com');
    });

    it('should include HTML content if provided', async () => {
      const mailOptions = {
        to: 'user@test.com',
        subject: 'Test',
        text: 'Plain text',
        html: '<p>HTML content</p>',
      };

      await service.sendMail(mailOptions);

      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.html).toBe('<p>HTML content</p>');
    });

    it('should include attachments if provided', async () => {
      const attachments = [{ filename: 'test.pdf', path: '/path/to/test.pdf' }];
      const mailOptions = {
        to: 'user@test.com',
        subject: 'Test',
        text: 'Body',
        attachments,
      };

      await service.sendMail(mailOptions);

      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs.attachments).toEqual(attachments);
    });

    it('should remove undefined values from mail options', async () => {
      const mailOptions = {
        to: 'user@test.com',
        subject: 'Test',
        text: 'Body',
      };

      await service.sendMail(mailOptions);

      const callArgs = mockTransporter.sendMail.mock.calls[0][0];
      expect(callArgs).not.toHaveProperty('cc');
      expect(callArgs).not.toHaveProperty('bcc');
      expect(callArgs).not.toHaveProperty('html');
    });

    it('should throw error if sending fails', async () => {
      // Suppress error logs during this test since we're testing error handling
      const loggerErrorSpy = jest.spyOn(service['logger'], 'error').mockImplementation();

      mockTransporter.sendMail.mockRejectedValueOnce(new Error('Send failed'));

      const mailOptions = {
        to: 'user@test.com',
        subject: 'Test',
        text: 'Body',
      };

      await expect(service.sendMail(mailOptions)).rejects.toThrow('Send failed');

      // Verify that error was logged (but we suppressed the actual output)
      expect(loggerErrorSpy).toHaveBeenCalled();
      loggerErrorSpy.mockRestore();
    });
  });

  describe('verifyConnection', () => {
    it('should return true if connection is valid', async () => {
      // Override the mock to simulate successful verification
      mockTransporter.verify = jest.fn((callback) => {
        if (callback) {
          callback(null, true);
        }
        return Promise.resolve(true);
      });

      const result = await service.verifyConnection();

      expect(result).toBe(true);
    });

    it('should return false if connection fails', async () => {
      // Suppress error logs during this test since we're testing error handling
      const loggerErrorSpy = jest.spyOn(service['logger'], 'error').mockImplementation();

      // Override the mock to simulate failed verification
      mockTransporter.verify = jest.fn((callback) => {
        if (callback) {
          callback(new Error('Connection failed'));
        }
        return Promise.reject(new Error('Connection failed'));
      });

      const result = await service.verifyConnection();

      expect(result).toBe(false);
      // Verify that error was logged (but we suppressed the actual output)
      expect(loggerErrorSpy).toHaveBeenCalled();
      loggerErrorSpy.mockRestore();
    });
  });

  describe('with existing transporter', () => {
    it('should use provided transporter instance', async () => {
      const existingTransporter = {
        sendMail: jest.fn().mockResolvedValue({ messageId: 'existing-id' }),
        verify: jest.fn((callback) => {
          if (callback) {
            callback(null, true);
          }
          return Promise.resolve(true);
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          MailerService,
          {
            provide: MAILER_OPTIONS,
            useValue: {
              transport: existingTransporter,
              defaults: {},
            },
          },
        ],
      }).compile();

      const serviceWithTransporter = module.get<MailerService>(MailerService);

      const mailOptions = {
        to: 'user@test.com',
        subject: 'Test',
        text: 'Body',
      };

      await serviceWithTransporter.sendMail(mailOptions);

      expect(existingTransporter.sendMail).toHaveBeenCalled();
    });
  });
});
