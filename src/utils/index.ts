export const generateId = (): string => Date.now().toString(36) + Math.random().toString(36).substr(2);

export const isIP = (str: string): boolean => {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipv4Regex.test(str);
};

export const getSubnet = (ip: string): string => {
    if (!isIP(ip)) return 'Non-Standard';
    return ip.split('.').slice(0, 3).join('.') + '.0/24';
};
