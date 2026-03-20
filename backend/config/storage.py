from cloudinary_storage.storage import MediaCloudinaryStorage, RESOURCE_TYPES


class CloudinaryAutoResourceStorage(MediaCloudinaryStorage):
    """Pick Cloudinary resource type based on file extension."""

    VIDEO_EXTENSIONS = {
        'mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'wmv', 'flv', 'mpeg', 'mpg'
    }
    RAW_EXTENSIONS = {
        'pdf', 'json', 'txt', 'csv', 'zip', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'
    }

    def _get_resource_type(self, name):
        normalized_name = (name or '').replace('\\', '/').lower()

        # Prefer folder-based routing because Cloudinary video public IDs
        # often do not preserve file extensions.
        if '/videos/' in normalized_name or normalized_name.startswith('videos/'):
            return RESOURCE_TYPES['VIDEO']
        if '/pdfs/' in normalized_name or normalized_name.startswith('pdfs/'):
            return RESOURCE_TYPES['RAW']

        extension = ''
        if '.' in normalized_name:
            extension = normalized_name.rsplit('.', 1)[-1]

        if extension in self.VIDEO_EXTENSIONS:
            return RESOURCE_TYPES['VIDEO']
        if extension in self.RAW_EXTENSIONS:
            return RESOURCE_TYPES['RAW']
        return RESOURCE_TYPES['IMAGE']
