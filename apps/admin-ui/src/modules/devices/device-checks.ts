import { type FieldProblem, problemValidator } from '../../fields/field-issue';

/* Client checks of device columns, each mirroring what the database refuses. */

const IPV4_OCTET = '(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)';
const IPV4 = new RegExp(`^${IPV4_OCTET}(?:\\.${IPV4_OCTET}){3}(?:/(?:3[0-2]|[12]?\\d))?$`, 'u');
const IPV6 = /^[0-9a-f.]*:[0-9a-f:.]*(?:\/(?:12[0-8]|1[01]\d|[1-9]?\d))?$/iu;

/** `devices.ip_address` is an `inet`: an IPv4 or IPv6 address, optionally with a `/prefix`. */
export const ipAddressProblem = (value: unknown): FieldProblem | null =>
  value === null || value === undefined || value === '' ||
  (typeof value === 'string' && (IPV4.test(value.trim()) || IPV6.test(value.trim())))
    ? null
    : { code: 'device.ipAddress', text: 'Enter an IP address, such as 192.168.1.20 or fd00::20.' };

export const checkIpAddress = problemValidator<string>(ipAddressProblem);

/** `devices_stream_url_no_credentials`: no `user:password@` before the host. */
export const streamUrlProblem = (value: unknown): FieldProblem | null =>
  typeof value === 'string' && /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#]*@/u.test(value)
    ? {
        code: 'device.streamCredentials',
        text: 'Leave the user name and password out of the address; enter them under Credentials.',
      }
    : null;

export const checkStreamUrl = problemValidator<string>(streamUrlProblem);

/** `devices_configuration_is_object`: the configuration is a JSON object (`{}` for none). */
export const configurationProblem = (value: unknown): FieldProblem | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? null
    : {
        code: 'device.configurationNotObject',
        text: 'Enter a JSON object, such as {"rtsp_transport": "tcp"}, or {} for none.',
      };

export const checkConfiguration = problemValidator(configurationProblem);
