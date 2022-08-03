import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  Image,
  TouchableOpacity,
  FlatList,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {
  widthPercentageToDP as wp,
  heightPercentageToDP as hp,
} from "react-native-responsive-screen";
import Video from "react-native-video";
import RNFetchBlob from "rn-fetch-blob";
import { check, PERMISSIONS, RESULTS, request } from "react-native-permissions";
import CameraRoll from "@react-native-community/cameraroll";
import Emoji from "react-native-emoji";

import RNFS from "react-native-fs";
import GColor from "../../../common/GColor";
import { Icons } from "../../../assets/images";
import { FontFamily, FontSize } from "../../../common/CustomFonts";
import BottomModal from "../../../components/BottomModal";
import { ApiEndPoints, MethodType } from "../../../services/ApiConstants";
import * as api from "../../../services/ApiMiddleware";
import { ScrollView, TextInput } from "react-native-gesture-handler";
import { asyncGetObject, asynckeys, getAsync } from "../../../utils/asynckeys";
import {
  MediaCategory,
  renderTimestampAdvanced,
} from "../../../utils/helpers_ts";

import {
  CustomButton,
  CustomTextInput,
  ProfilePicDialog,
} from "../../../common/GComponents";
import { KeyboardAwareScrollView } from "react-native-keyboard-aware-scroll-view";
import Loader from "../../../components/Loader";
import { showMessage } from "react-native-flash-message";
import {
  addComment,
  getMediaItem,
  setMediaFavorite,
} from "../../../services/MediaUploader";
import { getEventMemberList, renderName } from "../../../utils/helpers";
import { localUri } from "../../../services/FileServices";

export default function MediaSelected(props) {
  // Get the information from the selected media
  const item = props.route.params;

  const [eventDetails, setEventDetails] = useState(item.eventDetails);
  const [mediaItem, setMediaItem] = useState(item.item);
  const imageUrl = mediaItem.presigned_get_url;

  const initialLikes = mediaItem.likes || [];
  const initialComments = mediaItem.comments || [];

  // Setup variables
  const [loading, setLoader] = useState(false);
  const [profilePicDialogOpen, setProfilePicDialogOpen] = useState(false);

  const [userDetails, setUserDetails] = useState("");
  const [likeCount, setLikeCount] = useState(initialLikes.length);
  const [commentText, setCommentText] = useState("");
  useEffect(() => {
    // MARK - UID Lookup

    const uidMap = {};
    // We map each UID to the user info.
    getEventMemberList(eventDetails).forEach((usr) => {
      uidMap[usr._id || usr.userId] = usr;
    });
    setUidLookup(uidMap);
    asyncGetObject(asynckeys.userDetails).then((userDetails) => {
      setUserDetails(userDetails);
    });
  }, []);
  // For User Info lookup purposes (+ Efficiency, map vs array)
  const [uidLookup, setUidLookup] = useState({});

  const [comments, setComments] = useState(initialComments || []);
  const [imageLiked, setImageLiked] = useState(mediaItem.liked_by_user);
  const [showExpaens, setShowExpaens] = useState(false);

  const renderUserComments = ({ item }) => (
    <UserCommentsComponent item={item} uidLookup={uidLookup} />
  );

  async function deleteMedia() {
    const mediaItemId = item.item._id;
    if (
      item.item.uploaded_by == "" ||
      userDetails._id == item.item.uploaded_by
    ) {
      await api.deleteMediaItem(eventDetails._id, mediaItemId);
      props.navigation.goBack();
    } else {
      showMessage({
        message: "You can't delete this file other user upload file",
        type: "warning",
      });
    }
  }

  function saveFile() {
    if (Platform.OS == "ios") {
      downloadFile();
    } else {
      check(PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE)
        .then((result) => {
          console.log("Permission :", result);
          switch (result) {
            case RESULTS.GRANTED:
              downloadFile();
              break;
            case RESULTS.UNAVAILABLE:
            case RESULTS.DENIED:
            case RESULTS.LIMITED:
            case RESULTS.BLOCKED:
              requestPermission();
          }
        })
        .catch((error) => {
          alert("You need to give storage permission to download the file");
        });
    }
  }

  function requestPermission() {
    request(PERMISSIONS.ANDROID.WRITE_EXTERNAL_STORAGE).then((result1) => {
      console.log("request :", result1);
      switch (result1) {
        case RESULTS.GRANTED:
          downloadFile();
          break;
        case RESULTS.UNAVAILABLE:
        case RESULTS.DENIED:
        case RESULTS.LIMITED:
        case RESULTS.BLOCKED:
          alert("You need to give storage permission to download the file");
      }
    });
  }
  const selectFav = async () => {
    // Gather details for favoriting
    const mediaId = mediaItem._id;
    const eventId = eventDetails._id;
    const isFavorited = !imageLiked;

    // call API
    await setMediaFavorite(eventId, mediaId, isFavorited);

    setLikeCount(isFavorited ? likeCount + 1 : likeCount - 1);
    setImageLiked(isFavorited);
  };

  async function downloadFile() {
    try {
      console.log("MediaSelected.js : downloadFile() : downloading..");
      const isImage = /\.(gif|jpe?g|tiff?|png|webp|bmp)$/i.test(imageUrl);
      setLoader(true);
      await CameraRoll.save(imageUrl, isImage ? "photo" : "video");
      setLoader(false);
      showMessage({ type: "success", message: "Saved successfully." });
    } catch (error) {
      console.error("Error while downloading file: ", error.message);
    }
  }

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      enableAutomaticScroll
      enableOnAndroid={true}
      showsVerticalScrollIndicator={false}
    >
      <View>
        {item.item.media_type !== MediaCategory.Video ? (
          <TouchableOpacity onPress={() => setProfilePicDialogOpen(true)}>
            <Image
              source={{ uri: imageUrl }}
              style={styles.svImage}
              resizeMode="contain"
            />
          </TouchableOpacity>
        ) : (
          <View>
            <Video
              source={{ uri: localUri(item.item) }}
              style={styles.svImage}
              // style={{ width: 400, height: 400 }}
              resizeMode={"contain"}
              repeat={false}
              playInBackground={true}
              playWhenInactive={true}
              controls={true}
            />
          </View>
        )}
        <ImageOptionsComponent
          totalCount={likeCount}
          imageLiked={imageLiked}
          onPressImageLikeHandler={() => {
            selectFav();
          }}
          onOpenLikes={() =>
            // Number of likes was clicked => Show likers
            props.navigation.navigate("MediaLikes", {
              reactions: imageLiked
                ? // Local Likes may not be up-to-date.
                  // Filter out curr user & prepend, if media is liked.
                  [
                    userDetails,
                    ...mediaItem.likes.filter(
                      ({ _id }) => _id !== userDetails._id
                    ),
                  ]
                : mediaItem.likes.filter(({ _id }) => _id !== userDetails._id),
            })
          }
          onPressMenu={() => setShowExpaens(true)}
        />
        <View style={ucStyles.userInfoContainer}>
          {userDetails != "" &&
            (userDetails.profile_img_url != null &&
            userDetails.profile_img_url != "" ? (
              <Image
                source={{ uri: userDetails.profile_img_url }}
                style={ucStyles.svUserImage}
              />
            ) : (
              <View style={ucStyles.profilePicContainer}>
                <Text style={ucStyles.profilePicText}>
                  {userDetails.first_name.charAt(0).toUpperCase()}
                  {userDetails.last_name.charAt(0).toUpperCase()}
                </Text>
              </View>
            ))}

          <View
            style={[
              ucStyles.svUserInfoRightContainer,
              { flexDirection: "row", alignItems: "center" },
            ]}
          >
            <TextInput
              placeholder="Add Comment"
              maxLength={5000}
              multiline={true}
              onChangeText={(text) => setCommentText(text)}
              value={commentText}
              style={{
                flex: 0.6,
                marginEnd: wp(5),
                borderBottomWidth: 1,
                borderColor: GColor.btnLightgreyBg,
                flex: 1,
                paddingBottom: hp(1),
              }}
            />
            <CustomButton
              title="Comment"
              customBtnContainerStyle={{
                paddingHorizontal: wp(3),
                alignSelf: "center",
                marginTop: hp(2),
              }}
              onPress={async () => {
                console.log("MediaSelected.js : onPress : Adding comment. ");
                setTimeout(() => setLoader(true), 300);

                const msg = commentText;

                try {
                  await addComment(eventDetails._id, mediaItem._id, msg);
                  const newMediaItem = await getMediaItem(
                    eventDetails._id,
                    mediaItem._id
                  );
                  console.log("Response from getMediaItem : ", newMediaItem);
                  setLikeCount(newMediaItem.likes.length || 0);
                  setComments(newMediaItem.comments);
                  setMediaItem(newMediaItem);
                  setCommentText("");
                } catch (err) {
                  console.error(err);
                }

                setTimeout(() => setLoader(false), 300);
              }}
            />
          </View>
        </View>

        <FlatList
          data={comments}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) => renderUserComments({ item })}
          contentContainerStyle={{ paddingBottom: hp(2) }}
          showsVerticalScrollIndicator={false}
          style={{ height: hp(26), paddingVertical: hp(1) }}
        />
      </View>
      {loading && <Loader />}
      {profilePicDialogOpen && (
        <ProfilePicDialog
          type={item.item.type}
          image_url={imageUrl}
          toggleModal={() => setProfilePicDialogOpen(!profilePicDialogOpen)}
        />
      )}
      <BottomModal
        buttons={[
          {
            text: item.item.type == "video" ? "Save Video" : "Save Photo",
            onPress: () => {
              setTimeout(() => saveFile(), 500);
            },
          },
          {
            text: item.item.type == "video" ? "Delete Video" : "Delete Photo",
            onPress: () => {
              setTimeout(() => deleteMedia(), 500);
            },
          },
        ]}
        isVisible={showExpaens}
        toggleModal={() => setShowExpaens(!showExpaens)}
      />
    </KeyboardAwareScrollView>
  );
}

export function ReactionsView(props) {
  const { route } = props;
  if (!route.params?.reactions) {
    console.error("ReactionsView : Missing reaction data.");
  }
  // Filter users down to just unique records.
  console.warn(
    "Filtering user reactions. Assumption: Users can have only 1 reaction."
  );

  const users = route.params?.reactions
    ? [
        ...new Map(
          route.params.reactions.map((user) => [user._id, user])
        ).values(),
      ].filter((user) => user._id)
    : [];

  // Whether we should just show the list of users.
  const shouldHideReaction = route.params?.hideReactionIcon;

  const renderUserReaction = (reactionItem) => {
    const userReaction = reactionItem.item;
    return (
      <View
        style={{
          marginHorizontal: wp(1.5),
          flexDirection: "row",
          alignItems: "center",
          marginVertical: wp(1),
        }}
      >
        <View
          style={{
            aspectRatio: 1,
            height: hp(6),
          }}
        >
          {userReaction.profile_img_url ? (
            <Image
              source={{ uri: userReaction.profile_img_url }}
              style={flStyles.svUserImage}
            />
          ) : (
            <View style={flStyles.profilePicContainer}>
              <Text style={flStyles.profilePicText}>
                {userReaction.first_name.charAt(0).toUpperCase()}
                {userReaction.last_name.charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          {!shouldHideReaction && (
            <Emoji
              name={"heart"}
              style={{
                fontSize: hp(2),
                position: "absolute",
                bottom: 0,
                right: -5,
              }}
            />
          )}
        </View>
        <Text style={flStyles.svUserNameText}>
          {userReaction.first_name + " " + userReaction.last_name}
        </Text>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        style={{ marginStart: wp(5) }}
        data={users}
        renderItem={(user) => renderUserReaction(user)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: GColor.primaryWhiteBg,
    paddingHorizontal: wp(5),
  },
  subContainer: {
    flex: 1,
    marginHorizontal: wp(5),
  },
  svImage: {
    height: hp(40),
    // aspectRatio: 1.1,

    marginTop: hp(2),
  },
});

const ImageOptionsComponent = (props) => {
  return (
    <View style={ioStyles.container}>
      <TouchableOpacity
        style={ioStyles.svLikeBtn}
        onPress={props.onPressImageLikeHandler}
      >
        {props.imageLiked ? (
          <Image source={Icons.favorite_icon} resizeMode="contain" />
        ) : (
          <Image source={Icons.unfavorite_black_icon} resizeMode="contain" />
        )}
      </TouchableOpacity>

      <TouchableOpacity
        style={ioStyles.svLikesText}
        onPress={() => props.onOpenLikes()}
      >
        <Text>{props.totalCount} Likes</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={ioStyles.svHorizOptionsBtn}
        onPress={props.onPressMenu}
      >
        <Image source={Icons.option_horiz_black_icon} resizeMode="contain" />
      </TouchableOpacity>
    </View>
  );
};

const ioStyles = StyleSheet.create({
  container: {
    flexDirection: "row",
    marginVertical: hp(1),
    alignItems: "center",
    paddingVertical: hp(0.5),
  },
  svLikeBtn: {
    padding: hp(0.5),
  },
  svLikesText: {
    marginStart: wp(3),
    fontFamily: FontFamily.light,
    fontSize: FontSize.FontSize14,
    flex: 1,
  },
  svTagBtn: {
    marginEnd: wp(2),
    padding: hp(0.5),
  },
  svHorizOptionsBtn: {
    padding: hp(0.5),
  },
});

/**
 * A Comment component.
 * @param {Object} props the comment props. `props.item` will have the core info.
 * @returns the comment item component
 */
const UserCommentsComponent = (props) => {
  // Get the comment info
  const comment = props.item;
  const message = comment.message;
  const createdAt = renderTimestampAdvanced(comment.created_at);
  const createdBy = renderName(props.uidLookup[comment.created_by]);
  // render the Comment UI
  return (
    <View style={ucStyles.container}>
      <View style={ucStyles.userInfoContainer}>
        <View style={ucStyles.svMessageHeaderContainer}>
          <Text style={ucStyles.svUsernameText}>{createdBy}</Text>
          <Text style={ucStyles.svCommentDateText}>{createdAt}</Text>
        </View>
      </View>
      <Text style={ucStyles.svMessageText}>{message}</Text>
    </View>
  );
};

const ucStyles = StyleSheet.create({
  container: {
    padding: hp(1),
    backgroundColor: "#F7F9F9",
    margin: hp(1),
    borderRadius: hp(0.5),
  },
  profilePicText: {
    fontSize: FontSize.FontSize18,
    fontFamily: FontFamily.rbold,
    color: GColor.white,
    textAlign: "center",
  },
  profilePicContainer: {
    aspectRatio: 1,
    height: hp(6.5),
    borderRadius: hp(6.5) / 2,
    alignSelf: "center",
    justifyContent: "center",
    backgroundColor: GColor.breakLineBg,
  },
  svMessageHeaderContainer: {
    display: "flex",
    alignItems: "flex-start",
    width: "100%",
    flexDirection: "row",
  },
  userInfoContainer: {
    flexDirection: "row",
  },
  svUserImage: {
    height: hp(6.5),
    resizeMode: "cover",
    borderRadius: 100,
    aspectRatio: 1,
  },
  svUserInfoRightContainer: {
    marginStart: wp(0.5),
    flex: 1,
  },
  svUsernameText: {
    fontFamily: FontFamily.light,
    fontSize: FontSize.FontSize14,
  },
  svCommentDateText: {
    fontFamily: FontFamily.light,
    fontSize: FontSize.FontSize12,
    marginTop: hp(0.5),
    position: "absolute",
    right: 0,
  },
  svMessageText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.FontSize14,
    marginTop: hp(1),
  },
});

const flStyles = StyleSheet.create({
  itemContainer: {
    padding: hp(1),
    marginBottom: hp(1),
  },
  svUserImage: {
    resizeMode: "cover",
    aspectRatio: 1,

    height: hp(6),
    borderRadius: 100,
  },
  svUserNameText: {
    fontFamily: FontFamily.semiBold,
    fontSize: FontSize.FontSize16,
    color: GColor.black,
    flex: 1,
    marginStart: wp(4),
  },

  svBtnText: {
    fontFamily: FontFamily.bold,
    fontSize: FontSize.FontSize14,
    color: GColor.themeBlue,
  },
  profilePicText: {
    color: "white",
    fontSize: FontSize.FontSize14,
    fontFamily: FontFamily.rbold,
    textAlign: "center",
  },
  profilePicContainer: {
    aspectRatio: 1,
    height: hp(6),
    borderRadius: hp(3),
    justifyContent: "center",
    backgroundColor: GColor.breakLineBg,
  },
});
